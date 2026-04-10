import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { ShopeeIncome } from "../database/mongoose/schemas/ShopeeIncome"
import { ShopeeChannel } from "../database/mongoose/schemas/ShopeeChannel"
import { ShopeeProduct } from "../database/mongoose/schemas/ShopeeProduct"
import * as XLSX from "xlsx"
import * as moment from "moment"

type ShopeeIncomeOrderDraft = {
  orderId: string
  packageId: string
  orderDate: Date
  orderStatus: string
  cancelReason: string
  trackingNumber: string
  expectedDeliveryDate: Date | null
  shippedDate: Date | null
  deliveryTime: Date | null
  products: {
    variantSku: Types.ObjectId
    originalPrice: number
    sellerDiscount: number
    buyerPaidTotal: number
  }[]
}

@Injectable()
export class ShopeeIncomesService {
  constructor(
    @InjectModel("shopeeincomes")
    private readonly shopeeIncomeModel: Model<ShopeeIncome>,
    @InjectModel("shopeechannels")
    private readonly channelModel: Model<ShopeeChannel>,
    @InjectModel("shopeeproducts")
    private readonly shopeeProductModel: Model<ShopeeProduct>
  ) {}

  private asString(value: unknown): string {
    return String(value ?? "").trim()
  }

  private parseNumber(value: unknown): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value
    }
    const raw = this.asString(value)
    if (!raw || raw === "-") return 0
    const normalized = raw.replace(/,/g, "")
    const parsed = Number.parseFloat(normalized)
    return Number.isFinite(parsed) ? parsed : 0
  }

  private parseDate(value: unknown): Date | null {
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value
    }

    if (typeof value === "number" && Number.isFinite(value)) {
      const parsed = XLSX.SSF.parse_date_code(value)
      if (parsed) {
        return new Date(
          parsed.y,
          parsed.m - 1,
          parsed.d,
          parsed.H,
          parsed.M,
          parsed.S
        )
      }
    }

    const raw = this.asString(value)
    if (!raw || raw === "-") return null

    const parsed = moment(
      raw,
      [
        moment.ISO_8601,
        "YYYY-MM-DD HH:mm:ss",
        "YYYY-MM-DD HH:mm",
        "YYYY-MM-DD",
        "DD/MM/YYYY HH:mm:ss",
        "DD/MM/YYYY HH:mm",
        "DD/MM/YYYY"
      ],
      true
    )

    if (parsed.isValid()) {
      return parsed.toDate()
    }

    const fallback = new Date(raw)
    return Number.isNaN(fallback.getTime()) ? null : fallback
  }

  private escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  }

  async insertIncomeFromXlsx(dto: {
    incomeFile: Express.Multer.File
    channel: string
  }): Promise<{
    success: boolean
    inserted: number
    skipped: number
    errors: string[]
  }> {
    try {
      if (!Types.ObjectId.isValid(dto.channel)) {
        throw new HttpException("ID kênh không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const channel = await this.channelModel.findById(dto.channel).exec()
      if (!channel) {
        throw new HttpException(
          "Không tìm thấy kênh Shopee này",
          HttpStatus.NOT_FOUND
        )
      }

      const workbook = XLSX.read(dto.incomeFile.buffer, { type: "buffer" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[]

      if (!rawData.length) {
        throw new HttpException("File Excel trống", HttpStatus.BAD_REQUEST)
      }

      let inserted = 0
      let skipped = 0
      const errors: string[] = []
      const ordersMap = new Map<string, ShopeeIncomeOrderDraft>()
      const uniqueVariantSkus = Array.from(
        new Set(
          rawData
            .map((row) => this.asString(row["SKU phân loại hàng"]))
            .filter(Boolean)
        )
      )
      const shopeeProducts = await this.shopeeProductModel
        .find({
          name: { $in: uniqueVariantSkus },
          deletedAt: null
        })
        .select({ _id: 1, name: 1 })
        .lean()
        .exec()
      const shopeeProductMap = new Map(
        shopeeProducts.map((product) => [product.name, product._id as Types.ObjectId])
      )

      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i]
        const rowNum = i + 2

        try {
          const orderId = this.asString(row["Mã đơn hàng"])
          const variantSkuCode = this.asString(row["SKU phân loại hàng"])
          const orderDate = this.parseDate(row["Ngày đặt hàng"])

          if (!orderId || !variantSkuCode || !orderDate) {
            errors.push(
              `Dòng ${rowNum}: Thiếu Mã đơn hàng, SKU phân loại hàng hoặc Ngày đặt hàng`
            )
            skipped++
            continue
          }
          const shopeeProductId = shopeeProductMap.get(variantSkuCode)
          if (!shopeeProductId) {
            errors.push(
              `Dòng ${rowNum}: Không tìm thấy ShopeeProduct cho SKU "${variantSkuCode}"`
            )
            skipped++
            continue
          }

          const product = {
            variantSku: shopeeProductId,
            originalPrice: this.parseNumber(row["Giá gốc"]),
            sellerDiscount: this.parseNumber(row["Người bán trợ giá"]),
            buyerPaidTotal: this.parseNumber(
              row["Tổng số tiền Người mua thanh toán"]
            )
          }

          if (!ordersMap.has(orderId)) {
            ordersMap.set(orderId, {
              orderId,
              packageId: this.asString(row["Mã Kiện Hàng"]),
              orderDate,
              orderStatus: this.asString(row["Trạng Thái Đơn Hàng"]),
              cancelReason: this.asString(row["Lý do hủy"]),
              trackingNumber: this.asString(row["Mã vận đơn"]),
              expectedDeliveryDate: this.parseDate(
                row["Ngày giao hàng dự kiến"]
              ),
              shippedDate: this.parseDate(row["Ngày gửi hàng"]),
              deliveryTime: this.parseDate(row["Thời gian giao hàng"]),
              products: []
            })
          }

          const currentOrder = ordersMap.get(orderId)
          if (!currentOrder) {
            skipped++
            errors.push(`Dòng ${rowNum}: Không thể gom dữ liệu đơn hàng`)
            continue
          }

          currentOrder.packageId ||= this.asString(row["Mã Kiện Hàng"])
          currentOrder.orderStatus ||= this.asString(row["Trạng Thái Đơn Hàng"])
          currentOrder.cancelReason ||= this.asString(row["Lý do hủy"])
          currentOrder.trackingNumber ||= this.asString(row["Mã vận đơn"])
          currentOrder.expectedDeliveryDate ||=
            this.parseDate(row["Ngày giao hàng dự kiến"])
          currentOrder.shippedDate ||= this.parseDate(row["Ngày gửi hàng"])
          currentOrder.deliveryTime ||= this.parseDate(row["Thời gian giao hàng"])
          currentOrder.products.push(product)
        } catch (err) {
          errors.push(`Dòng ${rowNum}: Lỗi hệ thống - ${err.message}`)
          skipped++
        }
      }

      for (const [orderId, orderData] of ordersMap.entries()) {
        try {
          await this.shopeeIncomeModel
            .findOneAndDelete({
              orderId,
              channel: new Types.ObjectId(dto.channel)
            })
            .exec()

          await this.shopeeIncomeModel.create({
            ...orderData,
            channel: new Types.ObjectId(dto.channel)
          })

          inserted++
        } catch (error) {
          console.error(`Failed to insert order ${orderId}:`, error)
          errors.push(`Đơn ${orderId}: Không thể lưu vào DB - ${error.message}`)
          skipped++
        }
      }

      return {
        success: true,
        inserted,
        skipped,
        errors: errors.slice(0, 50)
      }
    } catch (error) {
      console.error("Excel Import Error:", error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi xử lý file Excel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchIncomes(filters: {
    productCode?: string
    startDate?: string
    endDate?: string
    channelId?: string
    page?: number
    limit?: number
  }): Promise<{
    data: ShopeeIncome[]
    total: number
    page: number
    limit: number
  }> {
    try {
      const page = Math.max(1, filters.page || 1)
      const limit = Math.max(1, Math.min(100, filters.limit || 10))
      const skip = (page - 1) * limit

      // Build query
      const query: any = {}

      // Filter by channel
      if (filters.channelId) {
        if (!Types.ObjectId.isValid(filters.channelId)) {
          throw new HttpException("Invalid channel ID", HttpStatus.BAD_REQUEST)
        }
        query.channel = new Types.ObjectId(filters.channelId)
      }

      if (filters.startDate || filters.endDate) {
        query.orderDate = {}
        if (filters.startDate) {
          query.orderDate.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          const endDate = new Date(filters.endDate)
          endDate.setHours(23, 59, 59, 999)
          query.orderDate.$lte = endDate
        }
      }

      if (typeof filters.productCode === "string" && filters.productCode.trim()) {
        const productKeyword = filters.productCode.trim()

        if (Types.ObjectId.isValid(productKeyword)) {
          query["products.variantSku"] = new Types.ObjectId(productKeyword)
        } else {
          const matchedProducts = await this.shopeeProductModel
            .find({
              name: {
                $regex: this.escapeRegex(productKeyword),
                $options: "i"
              },
              deletedAt: null
            })
            .select({ _id: 1 })
            .lean()
            .exec()

          if (!matchedProducts.length) {
            return { data: [], total: 0, page, limit }
          }

          query["products.variantSku"] = {
            $in: matchedProducts.map((product) => product._id)
          }
        }
      }

      const [data, total] = await Promise.all([
        this.shopeeIncomeModel
          .find(query)
          .populate("channel")
          .populate("products.variantSku")
          .sort({ orderDate: -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.shopeeIncomeModel.countDocuments(query).exec()
      ])

      return {
        data,
        total,
        page,
        limit
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Error searching incomes",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
