import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import {
  SalesItem,
  SalesItemFactory,
  SalesItemSource
} from "../database/mongoose/schemas/SalesItem"
import * as XLSX from "xlsx"

interface XlsxSalesItemData {
  Mã?: string
  Tên?: string
  "Tên Trung Quốc"?: string
  Xưởng?: string
  "Giá shipcode"?: number
  "Nguồn gốc"?: string
}

@Injectable()
export class SalesItemsService {
  constructor(
    @InjectModel("salesitems")
    private readonly salesItemModel: Model<SalesItem>
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
    updated: number
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
      let updated = 0
      const errors: string[] = []

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const rowNumber = i + 2 // Excel rows start at 1, plus header row

        try {
          // Skip empty rows
          if (!row["Mã"] && !row["Tên"] && !row["Tên Trung Quốc"]) {
            continue
          }

          // Use default values for missing fields
          const code = row["Mã"]
            ? row["Mã"].toString().trim()
            : `AUTO_${Date.now()}_${i}`
          const nameVn = row["Tên"]
            ? row["Tên"].toString().trim()
            : "Chưa có tên"
          const nameCn = row["Tên Trung Quốc"]
            ? row["Tên Trung Quốc"].toString().trim()
            : "未命名"
          const factoryValue = row["Xưởng"]
            ? row["Xưởng"].toString().trim()
            : "kẹo mút"
          const price =
            row["Giá shipcode"] !== undefined && row["Giá shipcode"] !== null
              ? Number(row["Giá shipcode"])
              : 0
          const sourceValue = row["Nguồn gốc"]
            ? row["Nguồn gốc"].toString().trim()
            : "Trong nhà máy"

          // Validate price is a number
          if (isNaN(price)) {
            errors.push(
              `Dòng ${rowNumber}: Giá shipcode không hợp lệ, sử dụng giá 0`
            )
          }

          // Map factory and source with defaults
          let factory: SalesItemFactory
          let source: SalesItemSource

          try {
            factory = this.mapFactory(factoryValue)
          } catch (error) {
            factory = "candy" // Default factory
            errors.push(
              `Dòng ${rowNumber}: ${error.message}, sử dụng mặc định "candy"`
            )
          }

          try {
            source = this.mapSource(sourceValue)
          } catch (error) {
            source = "inside" // Default source
            errors.push(
              `Dòng ${rowNumber}: ${error.message}, sử dụng mặc định "inside"`
            )
          }

          // Check if item exists
          const existingItem = await this.salesItemModel.findOne({ code })

          if (existingItem) {
            // Update existing item
            existingItem.name = { vn: nameVn, cn: nameCn }
            existingItem.factory = factory
            existingItem.price = price
            existingItem.source = source
            existingItem.updatedAt = new Date()
            await existingItem.save()
            updated++
          } else {
            // Create new item
            await this.salesItemModel.create({
              code,
              name: { vn: nameVn, cn: nameCn },
              factory,
              price,
              source,
              createdAt: new Date(),
              updatedAt: new Date()
            })
            inserted++
          }
        } catch (error) {
          errors.push(`Dòng ${rowNumber}: ${error.message}`)
        }
      }

      // Return success with warnings if any
      return {
        success: true,
        inserted,
        updated,
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
}
