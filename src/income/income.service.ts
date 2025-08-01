import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Income } from "../database/mongoose/schemas/Income"
import {
  InsertIncomeFileDto,
  UpdateAffiliateTypeDto,
  XlsxAffiliateData,
  XlsxIncomeData
} from "./dto/income.dto"
import * as XLSX from "xlsx"
import { PackingRulesService } from "../packingrules/packingrules.service"
import { MonthGoal } from "../database/mongoose/schemas/MonthGoal"
import { Response } from "express"

@Injectable()
export class IncomeService {
  constructor(
    @InjectModel("incomes")
    private readonly incomeModel: Model<Income>,
    @InjectModel("monthgoals")
    private readonly monthGoalModel: Model<MonthGoal>,
    private readonly packingRulesService: PackingRulesService
  ) {}

  async insertIncome(dto: InsertIncomeFileDto): Promise<void> {
    try {
      const workbook = XLSX.read(dto.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const readData = XLSX.utils.sheet_to_json(sheet) as XlsxIncomeData[]
      const data = readData
        .slice(1)
        .filter((line) => line["Cancelation/Return Type"] !== "Cancel")

      const start = new Date(dto.date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(dto.date)
      end.setHours(23, 59, 59, 999)

      // 1. Lấy toàn bộ incomes trong ngày
      const incomes = await this.incomeModel.find({
        date: { $gte: start, $lte: end }
      })

      // 2. Với từng income, filter lại products
      for (const income of incomes) {
        const oldLength = income.products.length
        // Loại bỏ products cùng source
        income.products = income.products.filter((p) => p.source !== dto.type)
        if (income.products.length === 0) {
          // Nếu sau filter rỗng thì xoá hẳn document
          await this.incomeModel.deleteOne({ _id: income._id })
        } else if (income.products.length < oldLength) {
          await income.save()
        }
      }

      // 3. Build lại data mới từ file, giữ nguyên các logic đặc biệt của mày
      const existed = await this.incomeModel
        .find(
          {
            date: { $gte: start, $lte: end }
          },
          { orderId: 1 }
        )
        .lean()
      const existedOrderIds = new Set(existed.map((x) => x.orderId))

      // group
      const newIncomesMap = data.reduce(
        (acc, line) => {
          const orderId = line["Order ID"]
          if (!acc[orderId]) acc[orderId] = []
          acc[orderId].push(line)
          return acc
        },
        {} as Record<string, XlsxIncomeData[]>
      )

      for (const orderId in newIncomesMap) {
        const lines = newIncomesMap[orderId]
        if (existedOrderIds.has(orderId)) {
          // Đã tồn tại: update thêm products mới cho đúng logic
          const doc = await this.incomeModel.findOne({
            orderId,
            date: { $gte: start, $lte: end }
          })
          // Build new products theo rule
          let newProducts: any[] = []
          if (dto.type === "affiliate") {
            newProducts = lines.map((line) => ({
              code: line["Seller SKU"],
              name: line["Product Name"],
              source: "affiliate",
              quantity: line["Quantity"],
              quotation: line["SKU Unit Original Price"],
              price: line["SKU Subtotal Before Discount"],
              sourceChecked: false
            }))
          } else {
            if (lines.length > 1) {
              newProducts = lines.slice(1).map((line) => ({
                code: line["Seller SKU"],
                name: line["Product Name"],
                source: dto.type,
                quantity: line["Quantity"],
                quotation: line["SKU Unit Original Price"],
                price: line["SKU Subtotal Before Discount"],
                sourceChecked: false
              }))
            }
          }
          // Thêm vào cuối mảng products và save lại doc
          if (newProducts.length > 0) {
            doc.products = [...doc.products, ...newProducts]
            await doc.save()
          }
        } else {
          // orderId mới: add mới bình thường
          const products = lines.map((line) => ({
            code: line["Seller SKU"],
            name: line["Product Name"],
            source: dto.type,
            quantity: line["Quantity"],
            quotation: line["SKU Unit Original Price"],
            price: line["SKU Subtotal Before Discount"],
            sourceChecked: false
          }))
          await this.incomeModel.create({
            orderId,
            customer: lines[0]["Buyer Username"],
            province: lines[0]["Province"],
            date: dto.date,
            products
          })
        }
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính toán doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteIncomeByDate(date: Date): Promise<void> {
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      const result = await this.incomeModel.deleteMany({
        date: {
          $gte: start,
          $lte: end
        }
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xoá income theo ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateAffiliateType(dto: UpdateAffiliateTypeDto): Promise<void> {
    try {
      const workbook = XLSX.read(dto.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet) as XlsxAffiliateData[]
      const ownUsers = ["mycandyvn2023"]

      data.forEach(async (line) => {
        const existedOrder = await this.incomeModel
          .findOne({
            orderId: line["ID đơn hàng"]
          })
          .exec()
        if (existedOrder) {
          const foundProduct = existedOrder.products.find((p) => {
            return (
              p.code === line["Sku người bán"] &&
              p.quantity === Number(line["Số lượng"]) &&
              p.sourceChecked === false
            )
          })

          if (foundProduct) {
            foundProduct.sourceChecked = true
            foundProduct.creator = line["Tên người dùng nhà sáng tạo"]
            foundProduct.source = ownUsers.includes(
              line["Tên người dùng nhà sáng tạo"]
            )
              ? "ads"
              : line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"] &&
                  !line["Tỷ lệ hoa hồng tiêu chuẩn ước tính"]
                ? "affiliate-ads"
                : line["Tỷ lệ hoa hồng tiêu chuẩn ước tính"] &&
                    !line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
                  ? "affiliate"
                  : "other"
            foundProduct.content = line["Loại nội dung"]
            foundProduct.affliateAdsPercentage = Number(
              line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
            )
            await existedOrder.save()
          }
        }
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật loại affiliate",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getIncomesByDateRange(
    startDate: Date,
    endDate: Date,
    page = 1,
    limit = 10,
    orderId?: string,
    productCode?: string,
    productSource?: string
  ): Promise<{ incomes: Income[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const start = new Date(startDate)
      start.setUTCHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setUTCHours(23, 59, 59, 999)

      // Build filter
      const filter: any = {
        date: { $gte: start, $lte: end }
      }
      if (orderId) filter.orderId = String(orderId).trim()
      // Lọc theo các trường trong mảng products
      if (productCode) filter["products.code"] = productCode
      if (productSource) filter["products.source"] = productSource

      const total = await this.incomeModel.countDocuments(filter)

      const incomes = await this.incomeModel
        .find(filter)
        .sort({ date: 1, _id: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .exec()

      return { incomes, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy doanh thu theo ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateIncomesBox(date: Date): Promise<void> {
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      const incomes = await this.incomeModel
        .find({
          date: {
            $gte: start,
            $lte: end
          }
        })
        .exec()

      for (const income of incomes) {
        let needSave = false

        for (const product of income.products) {
          const boxType = await this.packingRulesService.getPackingType(
            product.code,
            product.quantity
          )

          if (product.box !== boxType) {
            product.box = boxType
            needSave = true
          }
        }

        if (needSave) {
          await income.save()
        }
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật box cho doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async totalIncomeByMonth(month: number): Promise<number> {
    try {
      const start = new Date(new Date().getFullYear(), month, 1)
      const end = new Date(new Date().getFullYear(), month + 1, 0)

      const incomes = await this.incomeModel
        .find({
          date: {
            $gte: start,
            $lte: end
          }
        })
        .exec()

      return incomes.reduce((total, income) => {
        return (
          total +
          income.products.reduce((sum, product) => sum + product.price, 0)
        )
      }, 0)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính tổng doanh thu theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async totalQuantityByMonth(month: number): Promise<number> {
    try {
      const start = new Date(new Date().getFullYear(), month, 1)
      const end = new Date(new Date().getFullYear(), month + 1, 0)

      const incomes = await this.incomeModel
        .find({
          date: {
            $gte: start,
            $lte: end
          }
        })
        .exec()

      return incomes.reduce((total, income) => {
        return (
          total +
          income.products.reduce((sum, product) => sum + product.quantity, 0)
        )
      }, 0)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính tổng số lượng theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async KPIPercentageByMonth(month: number, year: number): Promise<number> {
    try {
      const goal = await this.monthGoalModel.findOne({ month, year }).lean()
      if (!goal || !goal.goal) {
        throw new HttpException(
          "Chưa thiết lập mục tiêu tháng này",
          HttpStatus.NOT_FOUND
        )
      }

      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999)

      const incomes = await this.incomeModel
        .find({
          date: { $gte: start, $lte: end }
        })
        .lean()

      const totalIncome = incomes.reduce(
        (total, income) =>
          total +
          (income.products?.reduce((sum, p) => sum + (p.price || 0), 0) || 0),
        0
      )

      const percent = goal.goal === 0 ? 0 : (totalIncome / goal.goal) * 100

      return Math.min(Math.round(percent * 100) / 100, 999)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính phần trăm KPI tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async exportIncomesToXlsx(
    startDate: Date,
    endDate: Date,
    res: Response,
    orderId?: string,
    productCode?: string,
    productSource?: string
  ): Promise<void> {
    try {
      const start = new Date(startDate)
      start.setUTCHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setUTCHours(23, 59, 59, 999)

      const packingTypesMap = {
        small: "Hộp bé",
        big: "Hộp to",
        long: "Hộp dài",
        "big-35": "Hộp to 35",
        square: "Hộp vuông"
      }

      const sourcesMap = {
        ads: "ADS",
        affiliate: "AFFILIATE",
        "affiliate-ads": "AFFILIATE ADS",
        other: "KHÁC"
      }

      // Build filter
      const filter: any = {
        date: { $gte: start, $lte: end }
      }
      if (orderId) filter.orderId = String(orderId).trim()
      if (productCode) filter["products.code"] = productCode
      if (productSource) filter["products.source"] = productSource

      // Lấy toàn bộ incomes
      const incomes = await this.incomeModel
        .find(filter)
        .sort({ date: 1, _id: 1 })
        .lean()

      // Flatten dữ liệu thành từng dòng sản phẩm
      const rows = []
      const merges = []
      let rowIndex = 1 // 0 là header

      incomes.forEach((income) => {
        income.products.forEach((product, idx) => {
          rows.push({
            "Ngày xuất đơn": idx === 0 ? income.date : "",
            "Mã đơn hàng": idx === 0 ? income.orderId : "",
            "Khách hàng": idx === 0 ? income.customer : "",
            "Tỉnh thành": idx === 0 ? income.province : "",
            "Mã SP": product.code,
            "Tên SP": product.name,
            Nguồn: sourcesMap[product.source],
            "Số lượng": product.quantity,
            "Báo giá": product.quotation,
            "Giá bán": product.price,
            "Phần trăm Affiliate": product.affliateAdsPercentage ?? "",
            "Loại nội dung": product.content ?? "",
            "Quy cách đóng hộp": packingTypesMap[product.box ?? ""],
            "Nhà sáng tạo": product.creator ?? ""
          })
        })
        if (income.products.length > 1) {
          ;[0, 1, 2, 3].forEach((colIdx) => {
            merges.push({
              s: { r: rowIndex, c: colIdx },
              e: { r: rowIndex + income.products.length - 1, c: colIdx }
            })
          })
        }
        rowIndex += income.products.length
      })

      // Tạo workbook & worksheet
      const ws = XLSX.utils.json_to_sheet(rows)
      ws["!merges"] = merges
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, "DoanhThu")

      // Ghi ra buffer
      const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

      // Xuất file về FE (dùng @Res())
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=DoanhThu_${startDate.toISOString().slice(0, 10)}_${endDate.toISOString().slice(0, 10)}.xlsx`
      )
      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      )
      res.send(buffer)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xuất file doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
