import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { endOfDay, startOfDay } from "date-fns"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import {
  SalesItem,
  SalesItemFactory,
  SalesItemSource
} from "../database/mongoose/schemas/SalesItem"
import { SalesOrder } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"
import {
  SalesInventoryLog,
  SalesInventoryLogType
} from "../database/mongoose/schemas/SalesInventoryLog"
import { SalesInventoryPeriod } from "../database/mongoose/schemas/SalesInventoryPeriod"
import * as XLSX from "xlsx"
import * as ExcelJS from "exceljs"

interface XlsxSalesItemData {
  Mã?: string
  Tên?: string
  "Tên Trung Quốc"?: string
  "Kích thước"?: string
  "Số khối"?: number
  "Quy cách"?: string
  "Giá bán"?: number
  "Cân nặng"?: number
}

type InventoryUploadRow = {
  code: string
  quantity: number
  warehouse?: string
  rowNumber: number
}

const INVENTORY_TIME_ZONE = "Asia/Ho_Chi_Minh"

@Injectable()
export class SalesItemsService {
  constructor(
    @InjectModel("salesitems")
    private readonly salesItemModel: Model<SalesItem>,
    @InjectModel("salesorders")
    private readonly salesOrderModel: Model<SalesOrder>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>,
    @InjectModel("salesinventorylogs")
    private readonly salesInventoryLogModel: Model<SalesInventoryLog>,
    @InjectModel("salesinventoryperiods")
    private readonly salesInventoryPeriodModel: Model<SalesInventoryPeriod>
  ) {}

  private normalizeSpreadsheetHeader(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toLowerCase()
  }

  private getVietnamDayRange(date: Date): { start: Date; end: Date } {
    const zonedDate = toZonedTime(date, INVENTORY_TIME_ZONE)
    return {
      start: fromZonedTime(startOfDay(zonedDate), INVENTORY_TIME_ZONE),
      end: fromZonedTime(endOfDay(zonedDate), INVENTORY_TIME_ZONE)
    }
  }

  private toQuantity(value: unknown): number {
    if (typeof value === "number") return value
    if (typeof value !== "string") return Number(value)
    return Number(value.replace(/[\s,]/g, ""))
  }

  private parseInventoryUploadRows(file: Express.Multer.File): {
    rows: InventoryUploadRow[]
    warnings: string[]
  } {
    const workbook = XLSX.read(file.buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    const sheet = workbook.Sheets[sheetName]
    const headerRow = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      blankrows: false
    })[0]
    const headers = (headerRow || [])
      .filter((header) => header !== undefined && header !== null)
      .map((header) => String(header).trim())
      .filter(Boolean)

    if (!headers.length) {
      throw new HttpException(
        "File trống hoặc không hợp lệ",
        HttpStatus.BAD_REQUEST
      )
    }

    const nonUppercaseHeaders = headers.filter(
      (header) => header !== header.toLocaleUpperCase("vi-VN")
    )
    if (nonUppercaseHeaders.length) {
      throw new HttpException(
        `Header file tồn kho phải viết HOA. Header không hợp lệ: ${nonUppercaseHeaders.join(", ")}`,
        HttpStatus.BAD_REQUEST
      )
    }

    const normalizedHeaders = new Set(
      headers.map((header) => this.normalizeSpreadsheetHeader(header))
    )
    if (
      !normalizedHeaders.has("mahang") ||
      (!normalizedHeaders.has("soluongnhap") &&
        !normalizedHeaders.has("nhaptrongky") &&
        !normalizedHeaders.has("xuattrongky"))
    ) {
      throw new HttpException(
        "File nhập kho phải có header MÃ HÀNG và cột số lượng theo template (viết HOA)",
        HttpStatus.BAD_REQUEST
      )
    }

    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: undefined
    })

    if (!data.length) {
      throw new HttpException(
        "File trống hoặc không hợp lệ",
        HttpStatus.BAD_REQUEST
      )
    }

    const rows: InventoryUploadRow[] = []
    const warnings: string[] = []

    data.forEach((rawRow, index) => {
      const rowNumber = index + 2
      const row = Object.entries(rawRow).reduce<Record<string, unknown>>(
        (result, [key, value]) => {
          result[this.normalizeSpreadsheetHeader(key)] = value
          return result
        },
        {}
      )
      const codeValue = row.mahang ?? row.masanpham ?? row.ma
      const importValue = row.soluongnhap ?? row.nhaptrongky ?? row.xuattrongky
      const warehouseValue = row.kho

      if (codeValue === undefined && importValue === undefined) return

      const code = codeValue?.toString().trim()
      const quantity = this.toQuantity(importValue)
      if (!code) {
        warnings.push(`Dòng ${rowNumber}: Thiếu MÃ HÀNG`)
        return
      }
      if (!Number.isFinite(quantity) || quantity < 0) {
        warnings.push(`Dòng ${rowNumber}: SỐ LƯỢNG NHẬP không hợp lệ`)
        return
      }
      if (quantity === 0) return

      rows.push({
        code,
        quantity,
        warehouse: warehouseValue?.toString().trim() || undefined,
        rowNumber
      })
    })

    return { rows, warnings }
  }

  async generateInventoryUploadTemplate(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Sheet1")
    const headers = [
      "MÃ HÀNG",
      "TÊN HÀNG",
      "ĐVT",
      "XUẤT \nTRONG KỲ",
      "KHO",
      "KÊNH",
      "GHI CHÚ"
    ]
    const widths = [27.71, 16.57, 18, 18.43, 27.57, 9.43, 8.71]

    worksheet.columns = widths.map((width) => ({
      width,
      style: {
        font: { name: "Times New Roman", size: 10 },
        alignment: { vertical: "middle", wrapText: true }
      }
    }))
    worksheet.addRow(headers)

    headers.forEach((_, index) => {
      const cell = worksheet.getRow(1).getCell(index + 1)
      cell.font = {
        name: "Times New Roman",
        size: 14,
        bold: true,
        color: { argb: "FF000000" }
      }
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF8EA9DB" },
        bgColor: { argb: "FF8EA9DB" }
      }
      cell.alignment = {
        horizontal: "center",
        vertical: "middle",
        wrapText: true
      }
      cell.border = {
        left: {
          style: "medium",
          color: { argb: index === 0 ? "FF000000" : "FFCCCCCC" }
        },
        right: { style: "medium", color: { argb: "FF000000" } },
        top: { style: "medium", color: { argb: "FFCCCCCC" } },
        bottom: { style: "medium", color: { argb: "FF000000" } }
      }
    })

    // Keep the same pre-sized input area as nhapkho-template.xlsx.
    worksheet.getRow(2998).height = 15.75
    worksheet.getCell("G2998").font = { name: "Times New Roman", size: 10 }

    const output = await workbook.xlsx.writeBuffer()
    return Buffer.from(output)
  }

  async uploadInventoryFile(
    file: Express.Multer.File,
    uploadedBy?: string
  ): Promise<{
    success: true
    imported: number
    skipped: number
    uploadBatchId: string
    warnings?: string[]
    totalWarnings?: number
  }> {
    if (!file) {
      throw new HttpException("Thiếu file tồn kho", HttpStatus.BAD_REQUEST)
    }

    const { rows, warnings } = this.parseInventoryUploadRows(file)
    if (!rows.length) {
      throw new HttpException(
        "File không có dòng NHẬP TRONG KỲ lớn hơn 0 hợp lệ",
        HttpStatus.BAD_REQUEST
      )
    }

    const items = await this.salesItemModel
      .find({ code: { $in: [...new Set(rows.map((row) => row.code))] } })
      .select("_id code")
      .lean()
    const itemByCode = new Map(items.map((item) => [item.code, item]))
    const acceptedRows = rows

    const uploadBatchId = new Types.ObjectId().toHexString()
    const createdBy =
      uploadedBy && Types.ObjectId.isValid(uploadedBy)
        ? new Types.ObjectId(uploadedBy)
        : undefined
    const now = new Date()
    const session = await this.salesItemModel.db.startSession()

    try {
      await session.withTransaction(async () => {
        for (const row of acceptedRows) {
          let item = itemByCode.get(row.code)
          if (!item) {
            const createdItem = await this.salesItemModel.create(
              [
                {
                  code: row.code,
                  name: { vn: row.code },
                  price: 0,
                  inventoryQuantity: 0,
                  createdAt: now,
                  updatedAt: now
                }
              ],
              { session }
            )
            item = createdItem[0]
            itemByCode.set(row.code, item)
          }
          const updatedItem = await this.salesItemModel.findByIdAndUpdate(
            item._id,
            {
              $inc: { inventoryQuantity: row.quantity },
              $set: {
                previousPeriodQuantity: 0,
                lastImportedQuantity: row.quantity,
                currentPeriodExportedQuantity: 0,
                inventoryUpdatedAt: now,
                lastImportedAt: now,
                updatedAt: now
              }
            },
            { new: true, session }
          )
          if (!updatedItem) {
            throw new HttpException(
              `Mã sản phẩm "${row.code}" không tồn tại`,
              HttpStatus.NOT_FOUND
            )
          }

          const previousQuantity = updatedItem.inventoryQuantity - row.quantity
          updatedItem.previousPeriodQuantity = previousQuantity
          await updatedItem.save({ session })

          await this.salesInventoryPeriodModel.create(
            [
              {
                itemId: updatedItem._id,
                code: row.code,
                previousQuantity,
                importedQuantity: row.quantity,
                exportedQuantity: 0,
                currentQuantity: updatedItem.inventoryQuantity,
                warehouse: row.warehouse,
                uploadBatchId,
                createdBy,
                importedAt: now,
                createdAt: now,
                updatedAt: now
              }
            ],
            { session }
          )

          await this.salesInventoryLogModel.create(
            [
              {
                code: row.code,
                itemId: updatedItem._id,
                type: "import" as SalesInventoryLogType,
                quantity: row.quantity,
                quantityBefore: previousQuantity,
                quantityAfter: updatedItem.inventoryQuantity,
                warehouse: row.warehouse,
                uploadBatchId,
                createdBy,
                date: now
              }
            ],
            { session }
          )
        }
      })
    } finally {
      await session.endSession()
    }

    return {
      success: true,
      imported: acceptedRows.length,
      skipped: warnings.length,
      uploadBatchId,
      ...(warnings.length > 0 && {
        warnings: warnings.slice(0, 20),
        totalWarnings: warnings.length
      })
    }
  }

  async getDailyInventoryReport(date: Date): Promise<{
    date: Date
    data: Array<{
      code: string
      name: string
      openingQuantity: number
      importedQuantity: number
      exportedQuantity: number
      closingQuantity: number
    }>
  }> {
    const { start, end } = this.getVietnamDayRange(date)
    const [items, daySummaries, latestBalances] = await Promise.all([
      this.salesItemModel
        .find()
        .select("code name.vn inventoryQuantity")
        .sort({ code: 1 })
        .lean(),
      this.salesInventoryLogModel.aggregate<{
        _id: string
        openingQuantity: number
        closingQuantity: number
        importedQuantity: number
        exportedQuantity: number
      }>([
        { $match: { date: { $gte: start, $lte: end } } },
        { $sort: { date: 1, createdAt: 1 } },
        {
          $group: {
            _id: "$code",
            openingQuantity: { $first: "$quantityBefore" },
            closingQuantity: { $last: "$quantityAfter" },
            importedQuantity: {
              $sum: { $cond: [{ $eq: ["$type", "import"] }, "$quantity", 0] }
            },
            exportedQuantity: {
              $sum: { $cond: [{ $eq: ["$type", "export"] }, "$quantity", 0] }
            }
          }
        }
      ]),
      this.salesInventoryLogModel.aggregate<{
        _id: string
        closingQuantity: number
      }>([
        { $match: { date: { $lte: end } } },
        { $sort: { date: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$code",
            closingQuantity: { $first: "$quantityAfter" }
          }
        }
      ])
    ])
    const daySummaryByCode = new Map(
      daySummaries.map((summary) => [summary._id, summary])
    )
    const latestBalanceByCode = new Map(
      latestBalances.map((balance) => [balance._id, balance.closingQuantity])
    )

    return {
      date: start,
      data: items.map((item) => {
        const code = item.code || ""
        const daySummary = daySummaryByCode.get(code)
        const latestBalance = latestBalanceByCode.get(code)
        return {
          code,
          name: item.name?.vn || "",
          openingQuantity:
            daySummary?.openingQuantity ??
            latestBalance ??
            item.inventoryQuantity ??
            0,
          importedQuantity: daySummary?.importedQuantity ?? 0,
          exportedQuantity: daySummary?.exportedQuantity ?? 0,
          closingQuantity:
            daySummary?.closingQuantity ??
            latestBalance ??
            item.inventoryQuantity ??
            0
        }
      })
    }
  }

  async generateDailyInventoryReportXlsx(date: Date): Promise<Buffer> {
    const report = await this.getDailyInventoryReport(date)
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Báo cáo tồn kho")
    worksheet.addRow([
      "MÃ HÀNG",
      "TÊN HÀNG",
      "TỒN KỲ TRƯỚC",
      "NHẬP",
      "XUẤT",
      "TỒN"
    ])
    report.data.forEach((item) => {
      worksheet.addRow([
        item.code,
        item.name,
        item.openingQuantity,
        item.importedQuantity,
        item.exportedQuantity,
        item.closingQuantity
      ])
    })
    worksheet.getRow(1).font = { bold: true, name: "Times New Roman" }
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF8EA9DB" }
    }
    worksheet.columns = [
      { width: 22 },
      { width: 36 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
      { width: 14 }
    ]
    worksheet.eachRow((row) => {
      row.alignment = { vertical: "middle" }
      row.font = { ...row.font, name: "Times New Roman" }
    })
    const output = await workbook.xlsx.writeBuffer()
    return Buffer.from(output)
  }

  async getInventoryDailyReportHistory(
    month: number,
    year: number
  ): Promise<{
    data: Array<{ date: Date; importedQuantity: number; exportedQuantity: number }>
    total: number
  }> {
    if (month < 1 || month > 12 || !Number.isInteger(year)) {
      throw new HttpException("Tháng hoặc năm không hợp lệ", HttpStatus.BAD_REQUEST)
    }

    const firstDay = fromZonedTime(
      `${year}-${String(month).padStart(2, "0")}-01T12:00:00.000`,
      INVENTORY_TIME_ZONE
    )
    const lastDay = fromZonedTime(
      `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}T12:00:00.000`,
      INVENTORY_TIME_ZONE
    )
    const { start } = this.getVietnamDayRange(firstDay)
    const { end } = this.getVietnamDayRange(lastDay)
    const summary = await this.salesInventoryLogModel.aggregate<{
      _id: string
      importedQuantity: number
      exportedQuantity: number
    }>([
      { $match: { date: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$date",
              timezone: INVENTORY_TIME_ZONE
            }
          },
          importedQuantity: {
            $sum: { $cond: [{ $eq: ["$type", "import"] }, "$quantity", 0] }
          },
          exportedQuantity: {
            $sum: { $cond: [{ $eq: ["$type", "export"] }, "$quantity", 0] }
          }
        }
      }
    ])
    const summaryByDate = new Map(summary.map((item) => [item._id, item]))
    const today = toZonedTime(new Date(), INVENTORY_TIME_ZONE)
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() + 1 === month
    const maxDay = isCurrentMonth
      ? today.getDate()
      : new Date(year, month, 0).getDate()
    const data = Array.from({ length: maxDay }, (_, index) => {
      const day = index + 1
      const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
      const totals = summaryByDate.get(dateKey)
      return {
        date: fromZonedTime(`${dateKey}T12:00:00.000`, INVENTORY_TIME_ZONE),
        importedQuantity: totals?.importedQuantity || 0,
        exportedQuantity: totals?.exportedQuantity || 0
      }
    }).reverse()

    return { data, total: data.length }
  }

  async getInventoryHistory(
    code?: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ data: SalesInventoryLog[]; total: number }> {
    const filter = code ? { code } : {}
    const skip = Math.max(page - 1, 0) * Math.min(Math.max(limit, 1), 200)
    const safeLimit = Math.min(Math.max(limit, 1), 200)
    const [data, total] = await Promise.all([
      this.salesInventoryLogModel
        .find(filter)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
        .lean(),
      this.salesInventoryLogModel.countDocuments(filter)
    ])
    return { data: data as SalesInventoryLog[], total }
  }

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
          if (!row["Mã"] && !row["Tên"]) {
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
              ? row["Quy cách"].toString().trim()
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
          if (!nameVn) {
            errors.push(`Dòng ${rowNumber}: Thiếu tên sản phẩm`)
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
          if (specification !== undefined) newItem.specification = specification
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

  private buildSearchFilter(
    searchText: string = "",
    factory?: SalesItemFactory,
    source?: SalesItemSource
  ): any {
    const searchRegex = new RegExp(searchText, "i")

    const filter: any = {
      $or: [
        { code: searchRegex },
        { "name.vn": searchRegex },
        { "name.cn": searchRegex }
      ]
    }

    if (factory) {
      filter.factory = factory
    }

    if (source) {
      filter.source = source
    }

    return filter
  }

  private getFactoryLabel(factory?: SalesItemFactory): string {
    const labels: Record<SalesItemFactory, string> = {
      candy: "Xưởng Kẹo mút",
      manufacturing: "Xưởng Gia công",
      position_MongCai: "Xưởng Móng Cái",
      jelly: "Xưởng Thạch",
      import: "Hàng Nhập khẩu"
    }
    return factory ? labels[factory] : ""
  }

  private getSourceLabel(source?: SalesItemSource): string {
    const labels: Record<SalesItemSource, string> = {
      inside: "Hàng trong nhà máy",
      outside: "Hàng ngoài nhà máy"
    }
    return source ? labels[source] : ""
  }

  private formatThousandsWithDot(value?: number): string {
    if (value === undefined || value === null || Number.isNaN(value)) return ""

    const [integerPart, decimalPart] = value.toString().split(".")
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")

    return decimalPart ? `${formattedInteger},${decimalPart}` : formattedInteger
  }

  async searchSalesItems(
    searchText: string,
    page: number = 1,
    limit: number = 20,
    factory?: SalesItemFactory,
    source?: SalesItemSource
  ): Promise<{ data: SalesItem[]; total: number }> {
    const skip = (page - 1) * limit
    const filter = this.buildSearchFilter(searchText, factory, source)

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

  async exportSalesItemsToXlsx(
    searchText: string = "",
    factory?: SalesItemFactory,
    source?: SalesItemSource
  ): Promise<Buffer> {
    try {
      const filter = this.buildSearchFilter(searchText, factory, source)
      const items = await this.salesItemModel
        .find(filter)
        .sort({ createdAt: -1 })

      const workbook = XLSX.utils.book_new()
      const headers = [
        "Mã",
        "Tên tiếng Việt",
        "Tên Trung Quốc",
        "Xưởng",
        "Nguồn gốc",
        "Giá bán",
        "Kích thước",
        "Số khối",
        "Quy cách",
        "Cân nặng"
      ]

      const rows = items.map((item) => [
        item.code || "",
        item.name?.vn || "",
        item.name?.cn || "",
        this.getFactoryLabel(item.factory),
        this.getSourceLabel(item.source),
        this.formatThousandsWithDot(item.price),
        item.size || "",
        item.area ?? "",
        item.specification || "",
        item.mass ?? ""
      ])

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
      worksheet["!cols"] = [
        { wch: 14 }, // Mã
        { wch: 28 }, // Tên tiếng Việt
        { wch: 24 }, // Tên Trung Quốc
        { wch: 20 }, // Xưởng
        { wch: 20 }, // Nguồn gốc
        { wch: 14 }, // Giá bán
        { wch: 16 }, // Kích thước
        { wch: 12 }, // Số khối
        { wch: 16 }, // Quy cách
        { wch: 12 } // Cân nặng
      ]

      XLSX.utils.book_append_sheet(workbook, worksheet, "SalesItems")
      return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in exportSalesItemsToXlsx:", error)
      throw new HttpException(
        "Có lỗi khi xuất danh sách sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
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
    specification?: string
    size?: string
    area?: number
    mass?: number
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

      const itemData: any = {
        code: payload.code,
        name: payload.name,
        factory: payload.factory,
        price: payload.price,
        source: payload.source,
        createdAt: new Date(),
        updatedAt: new Date()
      }

      if (payload.specification !== undefined)
        itemData.specification = payload.specification
      if (payload.size !== undefined) itemData.size = payload.size
      if (payload.area !== undefined) itemData.area = payload.area
      if (payload.mass !== undefined) itemData.mass = payload.mass

      const item = await this.salesItemModel.create(itemData)

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
      specification?: string
      size?: string
      area?: number
      mass?: number
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
      if (payload.specification !== undefined)
        item.specification = payload.specification
      if (payload.size !== undefined) item.size = payload.size
      if (payload.area !== undefined) item.area = payload.area
      if (payload.mass !== undefined) item.mass = payload.mass
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
