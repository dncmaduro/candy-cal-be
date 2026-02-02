import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { ShopeeIncome } from "../database/mongoose/schemas/ShopeeIncome"
import { ShopeeProduct } from "../database/mongoose/schemas/ShopeeProduct"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"
import * as XLSX from "xlsx"
import * as moment from "moment"

@Injectable()
export class ShopeeIncomesService {
  constructor(
    @InjectModel("shopeeincomes")
    private readonly shopeeIncomeModel: Model<ShopeeIncome>,
    @InjectModel("ShopeeProduct")
    private readonly shopeeProductModel: Model<ShopeeProduct>,
    @InjectModel("livestreamchannels")
    private readonly channelModel: Model<LivestreamChannel>
  ) {}

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
      // 1. Kiểm tra Channel
      if (!Types.ObjectId.isValid(dto.channel)) {
        throw new HttpException("ID kênh không hợp lệ", HttpStatus.BAD_REQUEST)
      }
      const channel = await this.channelModel.findById(dto.channel).exec()
      if (!channel) {
        throw new HttpException("Không tìm thấy kênh này", HttpStatus.NOT_FOUND)
      }

      // 2. Đọc file Excel
      const workbook = XLSX.read(dto.incomeFile.buffer, { type: "buffer" })
      const sheet = workbook.Sheets[workbook.SheetNames[0]]
      const rawData = XLSX.utils.sheet_to_json(sheet, { defval: "" }) as any[]

      if (!rawData.length) {
        throw new HttpException("File Excel trống", HttpStatus.BAD_REQUEST)
      }

      let inserted = 0
      let skipped = 0
      const errors: string[] = []
      const ordersMap = new Map<string, any>()

      // 3. Xử lý từng dòng dữ liệu
      for (let i = 0; i < rawData.length; i++) {
        const row = rawData[i]
        const rowNum = i + 2

        try {
          const orderId = String(row["Mã đơn hàng"] || "").trim()
          const dateStr = String(row["Ngày đặt hàng"] || "").trim()
          const skuCode = String(
            row["SKU phân loại hàng"] || row["SKU sản phẩm"] || ""
          ).trim()
          const productName = String(row["Tên sản phẩm"] || "").trim()

          // Kiểm tra thiếu thông tin cơ bản
          if (!orderId || !skuCode || !dateStr) {
            errors.push(`Dòng ${rowNum}: Thiếu Mã đơn, SKU hoặc Ngày đặt hàng`)
            skipped++
            continue
          }

          // Xử lý Ngày tháng (Shopee thường là YYYY-MM-DD HH:mm)
          let date = moment(dateStr, [
            "YYYY-MM-DD HH:mm",
            "DD/MM/YYYY HH:mm",
            "YYYY-MM-DD"
          ]).toDate()
          if (isNaN(date.getTime())) {
            errors.push(
              `Dòng ${rowNum}: Định dạng ngày không hợp lệ (${dateStr})`
            )
            skipped++
            continue
          }

          // Parse Số lượng & Giá (Xử lý cả trường hợp số có dấu phẩy/chấm)
          const quantity =
            parseInt(String(row["Số lượng"]).replace(/[^\d]/g, "")) || 0
          const priceStr = String(row["Giá ưu đãi"] || "0")
          const price = parseFloat(priceStr.replace(/[^\d.]/g, "")) || 0

          if (quantity <= 0) {
            errors.push(`Dòng ${rowNum}: Số lượng phải > 0`)
            skipped++
            continue
          }

          if (price <= 0) {
            errors.push(`Dòng ${rowNum}: Giá ưu đãi phải > 0`)
            skipped++
            continue
          }

          // TÌM SẢN PHẨM TRONG DB:
          // Quan trọng: Phải khớp với trường lưu mã SKU của bạn (ở đây tôi giả sử là trường 'name' hoặc 'sku')
          const shopeeProduct = await this.shopeeProductModel
            .findOne({
              $or: [{ name: skuCode }, { sku: skuCode }],
              deletedAt: null
            })
            .exec()

          if (!shopeeProduct) {
            errors.push(
              `Dòng ${rowNum}: Không tìm thấy sản phẩm có SKU "${skuCode}" trong hệ thống`
            )
            skipped++
            continue
          }

          // Gộp vào Map theo OrderId
          if (!ordersMap.has(orderId)) {
            ordersMap.set(orderId, {
              date,
              products: []
            })
          }

          ordersMap.get(orderId).products.push({
            code: shopeeProduct.name, // Lưu ID của Product
            name: productName,
            quantity,
            price
          })
        } catch (err) {
          errors.push(`Dòng ${rowNum}: Lỗi hệ thống - ${err.message}`)
          skipped++
        }
      }

      // 4. Ghi vào Database
      for (const [orderId, orderData] of ordersMap.entries()) {
        try {
          const total = orderData.products.reduce(
            (sum, p) => sum + p.price * p.quantity,
            0
          )

          // Xóa đơn cũ nếu trùng (Ghi đè dữ liệu mới nhất từ file)
          await this.shopeeIncomeModel
            .findOneAndDelete({
              orderId,
              channel: new Types.ObjectId(dto.channel)
            })
            .exec()

          const newIncome = await this.shopeeIncomeModel.create({
            date: orderData.date,
            orderId,
            creator: "",
            customer: "",
            products: orderData.products,
            source: "Excel Import",
            total,
            channel: new Types.ObjectId(dto.channel),
            affPercentage: 0
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
        errors: errors.slice(0, 50) // Trả về 50 lỗi đầu tiên để debug
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

      // Filter by date range
      if (filters.startDate || filters.endDate) {
        query.date = {}
        if (filters.startDate) {
          query.date.$gte = new Date(filters.startDate)
        }
        if (filters.endDate) {
          const endDate = new Date(filters.endDate)
          endDate.setHours(23, 59, 59, 999)
          query.date.$lte = endDate
        }
      }

      // Filter by product code
      if (filters.productCode) {
        query["products.code"] = filters.productCode
      }

      // Execute query
      const [data, total] = await Promise.all([
        this.shopeeIncomeModel
          .find(query)
          .populate("channel")
          .sort({ date: -1, createdAt: -1 })
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
