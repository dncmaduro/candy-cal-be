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
      const data = readData.slice(1)

      const incomes = data.reduce(
        (acc, line) => {
          const existedOrder = acc[line["Order ID"]]
          if (existedOrder) {
            existedOrder.products.push({
              code: line["Seller SKU"],
              name: line["Product Name"],
              source: dto.type,
              quantity: line["Quantity"],
              quotation: line["SKU Unit Original Price"],
              price: line["SKU Subtotal Before Discount"],
              sourceChecked: false
            })
            return acc
          }
          acc[line["Order ID"]] = {
            orderId: line["Order ID"],
            customer: line["Buyer Username"],
            province: line["Province"],
            date: dto.date,
            products: [
              {
                code: line["Seller SKU"],
                name: line["Product Name"],
                source: dto.type,
                quantity: line["Quantity"],
                quotation: line["SKU Unit Original Price"],
                price: line["SKU Subtotal Before Discount"],
                sourceChecked: false
              }
            ]
          }
          return acc
        },
        {} as {
          [key: string]: Income
        }
      )

      this.incomeModel.insertMany(Object.values(incomes))
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
      if (result.deletedCount === 0) {
        throw new HttpException(
          "Không có bản ghi nào để xoá!",
          HttpStatus.NOT_FOUND
        )
      }
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
              p.quantity === line["Số lượng"] &&
              p.sourceChecked === false
            )
          })

          if (foundProduct) {
            foundProduct.sourceChecked = true
            foundProduct.creator = line["Tên người dùng"]
            foundProduct.source = ownUsers.includes(line["Tên người dùng"])
              ? "ads"
              : !line["Tỉ lệ hoa hồng Quảng cáo cửa hàng"] &&
                  line["Tỉ lệ hoa hồng tiêu chuẩn"]
                ? "affiliate-ads"
                : !line["Tỉ lệ hoa hồng tiêu chuẩn"] &&
                    line["Tỉ lệ hoa hồng Quảng cáo cửa hàng"]
                  ? "affiliate"
                  : "other"
            foundProduct.content = line["Loại nội dung"]
            foundProduct.affliateAdsPercentage =
              line["Tỉ lệ hoa hồng Quảng cáo cửa hàng"]

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
    limit = 10
  ): Promise<{ incomes: Income[]; total: number }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const [incomes, total] = await Promise.all([
        this.incomeModel
          .find({
            date: {
              $gte: start,
              $lte: end
            }
          })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
        this.incomeModel.countDocuments({
          date: {
            $gte: start,
            $lte: end
          }
        })
      ])

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
}
