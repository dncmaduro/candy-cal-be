import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import {
  SalesItem,
  SalesItemFactory,
  SalesItemSource
} from "../database/mongoose/schemas/SalesItem"
import { SalesOrder } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"
import * as XLSX from "xlsx"

interface XlsxSalesItemData {
  Mã?: string
  Tên?: string
  "Tên Trung Quốc"?: string
  "Kích thước"?: string
  "Số khối"?: number
  "Quy cách"?: number
  "Giá bán"?: number
  "Cân nặng"?: number
}

@Injectable()
export class SalesItemsService {
  constructor(
    @InjectModel("salesitems")
    private readonly salesItemModel: Model<SalesItem>,
    @InjectModel("salesorders")
    private readonly salesOrderModel: Model<SalesOrder>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>
  ) {}

  private mapFactory(factoryValue: string): SalesItemFactory {
    const normalizedValue = factoryValue.toLowerCase().trim()

    if (normalizedValue.includes("kẹo mút")) return "candy"
    if (normalizedValue.includes("gia công")) return "manufacturing"
    if (normalizedValue.includes("móng cái")) return "position_MongCai"
    if (normalizedValue.includes("thạch")) return "jelly"
    if (normalizedValue.includes("nhập khẩu")) return "import"

    throw new HttpException(
      `Giá trị xưởng không hợp lệ: "${factoryValue}"`,
      HttpStatus.BAD_REQUEST
    )
  }

  private mapSource(sourceValue: string): SalesItemSource {
    const normalizedValue = sourceValue.toLowerCase().trim()

    if (normalizedValue.includes("trong nhà máy")) return "inside"
    if (normalizedValue.includes("ngoài nhà máy")) return "outside"

    throw new HttpException(
      `Giá trị nguồn gốc không hợp lệ: "${sourceValue}"`,
      HttpStatus.BAD_REQUEST
    )
  }

  async uploadSalesItems(file: Express.Multer.File): Promise<{
    success: true
    inserted: number
    skipped: number
    warnings?: string[]
    totalWarnings?: number
  }> {
    try {
      // Read Excel file
      const workbook = XLSX.read(file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet) as XlsxSalesItemData[]

      if (!data || data.length === 0) {
        throw new HttpException(
          "File trống hoặc không hợp lệ",
          HttpStatus.BAD_REQUEST
        )
      }

      let inserted = 0
      let skipped = 0
      const errors: string[] = []

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const rowNumber = i + 2 // Excel rows start at 1, plus header row

        try {
          // Skip empty rows
          if (!row["Mã"] && !row["Tên"] && !row["Tên Trung Quốc"]) {
            continue
          }

          // Extract fields from row
          const code = row["Mã"] ? row["Mã"].toString().trim() : undefined
          const nameVn = row["Tên"] ? row["Tên"].toString().trim() : ""
          const nameCn = row["Tên Trung Quốc"]
            ? row["Tên Trung Quốc"].toString().trim()
            : ""
          const size = row["Kích thước"]
            ? row["Kích thước"].toString().trim()
            : undefined
          const area =
            row["Số khối"] !== undefined && row["Số khối"] !== null
              ? Number(row["Số khối"])
              : undefined
          const specification =
            row["Quy cách"] !== undefined && row["Quy cách"] !== null
              ? Number(row["Quy cách"])
              : undefined
          const price =
            row["Giá bán"] !== undefined && row["Giá bán"] !== null
              ? Number(row["Giá bán"])
              : undefined
          const mass =
            row["Cân nặng"] !== undefined && row["Cân nặng"] !== null
              ? Number(row["Cân nặng"])
              : undefined

          // Validate required fields
          if (!nameVn || !nameCn) {
            errors.push(
              `Dòng ${rowNumber}: Thiếu tên sản phẩm (Tên hoặc Tên Trung Quốc)`
            )
            skipped++
            continue
          }

          if (price === undefined || isNaN(price)) {
            errors.push(`Dòng ${rowNumber}: Thiếu hoặc giá bán không hợp lệ`)
            skipped++
            continue
          }

          // Validate numeric fields
          if (area !== undefined && isNaN(area)) {
            errors.push(
              `Dòng ${rowNumber}: Số khối không hợp lệ, sử dụng giá trị undefined`
            )
          }
          if (specification !== undefined && isNaN(specification)) {
            errors.push(
              `Dòng ${rowNumber}: Quy cách không hợp lệ, sử dụng giá trị undefined`
            )
          }
          if (mass !== undefined && isNaN(mass)) {
            errors.push(
              `Dòng ${rowNumber}: Cân nặng không hợp lệ, sử dụng giá trị undefined`
            )
          }

          // Check if item exists by code (if code is provided)
          if (code) {
            const existingItem = await this.salesItemModel.findOne({ code })
            if (existingItem) {
              errors.push(
                `Dòng ${rowNumber}: Mã sản phẩm "${code}" đã tồn tại, bỏ qua`
              )
              skipped++
              continue
            }
          }

          // Create new item
          const newItem: any = {
            name: { vn: nameVn, cn: nameCn },
            price,
            createdAt: new Date(),
            updatedAt: new Date()
          }

          if (code) newItem.code = code
          if (size) newItem.size = size
          if (area !== undefined && !isNaN(area)) newItem.area = area
          if (specification !== undefined && !isNaN(specification))
            newItem.specification = specification
          if (mass !== undefined && !isNaN(mass)) newItem.mass = mass

          await this.salesItemModel.create(newItem)
          inserted++
        } catch (error) {
          errors.push(`Dòng ${rowNumber}: ${error.message}`)
        }
      }

      // Return success with warnings if any
      return {
        success: true,
        inserted,
        skipped,
        ...(errors.length > 0 && {
          warnings: errors.slice(0, 20), // Show first 20 warnings
          totalWarnings: errors.length
        })
      } as any
    } catch (error) {
      console.error("Error in uploadSalesItems:", error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Có lỗi khi xử lý file Excel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Generate Excel template for sales items upload
   */
  async generateUploadTemplate(): Promise<Buffer> {
    const workbook = XLSX.utils.book_new()

    // Define headers (Tên và Giá bán là bắt buộc)
    const headers = [
      "Mã",
      "Tên*",
      "Tên Trung Quốc*",
      "Kích thước",
      "Số khối",
      "Quy cách",
      "Giá bán*",
      "Cân nặng"
    ]

    // Define sample data rows
    const sampleData = [
      ["SP001", "Kẹo dâu", "草莓糖", "20x10x5", 1000, 50, 15000, 0.5],
      ["SP002", "Kẹo chanh", "柠檬糖", "15x8x4", 480, 40, 12000, 0.4],
      ["SP003", "Thạch nho", "葡萄果冻", "25x12x6", 1800, 60, 20000, 0.8]
    ]

    // Combine headers and sample data
    const data = [headers, ...sampleData]

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data)

    // Set column widths for better readability
    worksheet["!cols"] = [
      { wch: 12 }, // Mã
      { wch: 20 }, // Tên*
      { wch: 20 }, // Tên Trung Quốc*
      { wch: 15 }, // Kích thước
      { wch: 12 }, // Số khối
      { wch: 12 }, // Quy cách
      { wch: 15 }, // Giá bán*
      { wch: 12 } // Cân nặng
    ]

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "SalesItems")

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

    return buffer
  }

  async getAllSalesItems(
    page: number = 1,
    limit: number = 20
  ): Promise<{ data: SalesItem[]; total: number }> {
    const skip = (page - 1) * limit
    const [data, total] = await Promise.all([
      this.salesItemModel
        .find()
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.salesItemModel.countDocuments()
    ])
    return { data, total }
  }

  async searchSalesItems(
    searchText: string,
    page: number = 1,
    limit: number = 20,
    factory?: SalesItemFactory,
    source?: SalesItemSource
  ): Promise<{ data: SalesItem[]; total: number }> {
    const skip = (page - 1) * limit
    const searchRegex = new RegExp(searchText, "i")

    const filter: any = {
      $or: [
        { code: searchRegex },
        { "name.vn": searchRegex },
        { "name.cn": searchRegex }
      ]
    }

    // Add factory filter if provided
    if (factory) {
      filter.factory = factory
    }

    // Add source filter if provided
    if (source) {
      filter.source = source
    }

    const [data, total] = await Promise.all([
      this.salesItemModel
        .find(filter)
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 }),
      this.salesItemModel.countDocuments(filter)
    ])
    return { data, total }
  }

  async getAllFactories(): Promise<{
    data: Array<{ value: SalesItemFactory; label: string }>
  }> {
    const factories: Array<{ value: SalesItemFactory; label: string }> = [
      { value: "candy", label: "Xưởng Kẹo mút" },
      { value: "manufacturing", label: "Xưởng Gia công" },
      { value: "position_MongCai", label: "Xưởng Móng Cái" },
      { value: "jelly", label: "Xưởng Thạch" },
      { value: "import", label: "Hàng Nhập khẩu" }
    ]
    return { data: factories }
  }

  async getAllSources(): Promise<{
    data: Array<{ value: SalesItemSource; label: string }>
  }> {
    const sources: Array<{ value: SalesItemSource; label: string }> = [
      { value: "inside", label: "Hàng trong nhà máy" },
      { value: "outside", label: "Hàng ngoài nhà máy" }
    ]
    return { data: sources }
  }

  async createSalesItem(payload: {
    code: string
    name: { vn: string; cn: string }
    factory: SalesItemFactory
    price: number
    source: SalesItemSource
  }): Promise<SalesItem> {
    try {
      // Check if code already exists
      const existing = await this.salesItemModel.findOne({ code: payload.code })
      if (existing) {
        throw new HttpException(
          `Mã sản phẩm "${payload.code}" đã tồn tại`,
          HttpStatus.BAD_REQUEST
        )
      }

      const item = await this.salesItemModel.create({
        code: payload.code,
        name: payload.name,
        factory: payload.factory,
        price: payload.price,
        source: payload.source,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      return item
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in createSalesItem:", error)
      throw new HttpException(
        "Có lỗi khi tạo sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getSalesItemById(id: string): Promise<SalesItem | null> {
    try {
      const item = await this.salesItemModel.findById(id)
      if (!item) {
        throw new HttpException("Sản phẩm không tồn tại", HttpStatus.NOT_FOUND)
      }
      return item
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getSalesItemById:", error)
      throw new HttpException(
        "Có lỗi khi lấy thông tin sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateSalesItem(
    id: string,
    payload: {
      code?: string
      name?: { vn: string; cn: string }
      factory?: SalesItemFactory
      price?: number
      source?: SalesItemSource
    }
  ): Promise<SalesItem> {
    try {
      const item = await this.salesItemModel.findById(id)
      if (!item) {
        throw new HttpException("Sản phẩm không tồn tại", HttpStatus.NOT_FOUND)
      }

      // Check if code is being changed and if new code already exists
      if (payload.code && payload.code !== item.code) {
        const existing = await this.salesItemModel.findOne({
          code: payload.code
        })
        if (existing) {
          throw new HttpException(
            `Mã sản phẩm "${payload.code}" đã tồn tại`,
            HttpStatus.BAD_REQUEST
          )
        }
        item.code = payload.code
      }

      if (payload.name) item.name = payload.name
      if (payload.factory !== undefined) item.factory = payload.factory
      if (payload.price !== undefined) item.price = payload.price
      if (payload.source !== undefined) item.source = payload.source
      item.updatedAt = new Date()

      return await item.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in updateSalesItem:", error)
      throw new HttpException(
        "Có lỗi khi cập nhật sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteSalesItem(id: string): Promise<void> {
    try {
      const item = await this.salesItemModel.findById(id)
      if (!item) {
        throw new HttpException("Sản phẩm không tồn tại", HttpStatus.NOT_FOUND)
      }

      await this.salesItemModel.findByIdAndDelete(id)
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in deleteSalesItem:", error)
      throw new HttpException(
        "Có lỗi khi xóa sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getItemPurchaseQuantity(
    code: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<{ code: string; totalQuantity: number; orderCount: number }> {
    try {
      // Verify item exists
      const item = await this.salesItemModel.findOne({ code })
      if (!item) {
        throw new HttpException(
          `Sản phẩm với mã "${code}" không tồn tại`,
          HttpStatus.NOT_FOUND
        )
      }

      // Build date filter
      const dateFilter: any = {}
      if (startDate || endDate) {
        dateFilter.date = {}
        if (startDate) dateFilter.date.$gte = startDate
        if (endDate) dateFilter.date.$lte = endDate
      }

      // Find all orders containing this item code
      const orders = await this.salesOrderModel
        .find({
          ...dateFilter,
          "items.code": code
        })
        .lean()

      // Calculate total quantity
      let totalQuantity = 0
      orders.forEach((order) => {
        const matchingItems = order.items.filter((item) => item.code === code)
        matchingItems.forEach((item) => {
          totalQuantity += item.quantity
        })
      })

      return {
        code,
        totalQuantity,
        orderCount: orders.length
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getItemPurchaseQuantity:", error)
      throw new HttpException(
        "Có lỗi khi lấy thông tin số lượng đã mua",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getTopCustomersByItem(
    code: string,
    startDate?: Date,
    endDate?: Date,
    limit: number = 10
  ): Promise<{
    code: string
    topCustomers: Array<{
      funnel: SalesFunnel
      totalQuantity: number
      orderCount: number
    }>
  }> {
    try {
      // Verify item exists
      const item = await this.salesItemModel.findOne({ code })
      if (!item) {
        throw new HttpException(
          `Sản phẩm với mã "${code}" không tồn tại`,
          HttpStatus.NOT_FOUND
        )
      }

      // Build date filter
      const dateFilter: any = {}
      if (startDate || endDate) {
        dateFilter.date = {}
        if (startDate) dateFilter.date.$gte = startDate
        if (endDate) dateFilter.date.$lte = endDate
      }

      // Find all orders containing this item code
      const orders = await this.salesOrderModel
        .find({
          ...dateFilter,
          "items.code": code
        })
        .populate({
          path: "salesFunnelId",
          populate: [
            { path: "channel", model: "saleschannels" },
            { path: "user", model: "users", select: "name email" },
            { path: "province", model: "provinces" }
          ]
        })
        .lean()

      // Group by funnel and calculate quantities
      const funnelStats = new Map<
        string,
        { funnel: any; totalQuantity: number; orderCount: number }
      >()

      orders.forEach((order) => {
        const funnelId = order.salesFunnelId._id.toString()
        const matchingItems = order.items.filter((item) => item.code === code)

        let orderQuantity = 0
        matchingItems.forEach((item) => {
          orderQuantity += item.quantity
        })

        if (funnelStats.has(funnelId)) {
          const stats = funnelStats.get(funnelId)!
          stats.totalQuantity += orderQuantity
          stats.orderCount += 1
        } else {
          funnelStats.set(funnelId, {
            funnel: order.salesFunnelId,
            totalQuantity: orderQuantity,
            orderCount: 1
          })
        }
      })

      // Convert to array and sort by totalQuantity descending
      const topCustomers = Array.from(funnelStats.values())
        .sort((a, b) => b.totalQuantity - a.totalQuantity)
        .slice(0, limit)

      return {
        code,
        topCustomers
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getTopCustomersByItem:", error)
      throw new HttpException(
        "Có lỗi khi lấy danh sách khách hàng mua nhiều nhất",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
