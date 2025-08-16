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
        const shippingProvider = this.getShippingProviderName(lines[0] as any)
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
          }
          // Cập nhật đơn vị vận chuyển nếu có trong file
          if (shippingProvider) {
            doc.shippingProvider = shippingProvider
          }
          await doc.save()
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
            shippingProvider,
            date: dto.date,
            products
          })
        }
      }

      // Sau khi insert/update xong thì cập nhật quy cách đóng hộp ngay
      await this.updateIncomesBox(new Date(dto.date))
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
                  !line["Tỷ lệ hoa hồng tiêu chuẩn"]
                ? "affiliate-ads"
                : line["Tỷ lệ hoa hồng tiêu chuẩn"] &&
                    !line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
                  ? "affiliate"
                  : "other"
            foundProduct.content = line["Loại nội dung"]
            foundProduct.affiliateAdsPercentage = Number(
              line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
            )
            foundProduct.affiliateAdsAmount = Number(
              line["Thanh toán hoa hồng Quảng cáo cửa hàng ước tính"]
            )
            foundProduct.standardAffPercentage = Number(
              line["Tỷ lệ hoa hồng tiêu chuẩn"]
            )
            foundProduct.standardAffAmount = Number(
              line["Thanh toán hoa hồng tiêu chuẩn ước tính"]
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

  async totalIncomeByMonthSplit(
    month: number,
    year: number
  ): Promise<{ live: number; shop: number }> {
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
      const incomes = await this.incomeModel
        .find({ date: { $gte: start, $lte: end } })
        .lean()

      let live = 0
      let shop = 0
      for (const income of incomes) {
        const { live: liveProducts, shop: shopProducts } = this.splitByChannel(
          income.products || []
        )
        live += this.sumProductsAmount(liveProducts)
        shop += this.sumProductsAmount(shopProducts)
      }
      return { live, shop }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính doanh thu theo kênh",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async totalQuantityByMonthSplit(
    month: number,
    year: number
  ): Promise<{ live: number; shop: number }> {
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
      const incomes = await this.incomeModel
        .find({ date: { $gte: start, $lte: end } })
        .lean()

      let live = 0
      let shop = 0
      for (const income of incomes) {
        const { live: liveProducts, shop: shopProducts } = this.splitByChannel(
          income.products || []
        )
        live += this.sumProductsQuantity(liveProducts)
        shop += this.sumProductsQuantity(shopProducts)
      }
      return { live, shop }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính số lượng theo kênh",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async KPIPercentageByMonthSplit(
    month: number,
    year: number
  ): Promise<{ live: number; shop: number }> {
    try {
      const goal = await this.monthGoalModel.findOne({ month, year }).lean()
      if (!goal) {
        throw new HttpException(
          "Chưa thiết lập mục tiêu tháng này",
          HttpStatus.NOT_FOUND
        )
      }

      const { live, shop } = await this.totalIncomeByMonthSplit(month, year)
      const livePct =
        goal.liveStreamGoal === 0
          ? 0
          : Math.min(
              Math.round((live / goal.liveStreamGoal) * 10000) / 100,
              999
            )
      const shopPct =
        goal.shopGoal === 0
          ? 0
          : Math.min(Math.round((shop / goal.shopGoal) * 10000) / 100, 999)
      return { live: livePct, shop: shopPct }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính KPI theo kênh",
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
            "Đơn vị vận chuyển": idx === 0 ? income.shippingProvider || "" : "",
            "Mã SP": product.code,
            "Tên SP": product.name,
            Nguồn: sourcesMap[product.source],
            "Số lượng": product.quantity,
            "Báo giá": product.quotation,
            "Giá bán": product.price,
            "Phần trăm Affiliate": product.affiliateAdsPercentage ?? "",
            "Phần trăm Affiliate tiêu chuẩn":
              product.standardAffPercentage ?? "",
            "Loại nội dung": product.content ?? "",
            "Quy cách đóng hộp": packingTypesMap[product.box ?? ""],
            "Nhà sáng tạo": product.creator ?? "",
            "Thanh toán hoa hồng Quảng cáo cửa hàng ước tính":
              product.affiliateAdsAmount ?? "",
            "Thanh toán hoa hồng tiêu chuẩn ước tính":
              product.standardAffAmount ?? ""
          })
        })
        if (income.products.length > 1) {
          ;[0, 1, 2, 3, 4].forEach((colIdx) => {
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

  async getDailyStats(date: Date): Promise<{
    boxes: { box: string; quantity: number }[]
    totalIncome: number
    sources: {
      ads: number
      affiliate: number
      affiliateAds: number
      other: number
    }
    liveIncome: number
    shippingProviders: { provider: string; orders: number }[]
  }> {
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      const incomes = await this.incomeModel
        .find({ date: { $gte: start, $lte: end } })
        .lean()

      const boxMap: Record<string, number> = {}
      const shipMap: Record<string, number> = {}
      let totalIncome = 0
      let liveIncome = 0
      const sourceTotals = { ads: 0, affiliate: 0, affiliateAds: 0, other: 0 }

      for (const income of incomes) {
        // đếm số đơn theo đơn vị vận chuyển (mỗi income là một đơn)
        const provider = income.shippingProvider || "(unknown)"
        shipMap[provider] = (shipMap[provider] || 0) + 1

        for (const p of income.products || []) {
          const price = p.price || 0
          totalIncome += price
          // nguồn
          if (p.source === "ads") sourceTotals.ads += price
          else if (p.source === "affiliate") sourceTotals.affiliate += price
          else if (p.source === "affiliate-ads")
            sourceTotals.affiliateAds += price
          else sourceTotals.other += price
          // livestream
          if (
            typeof p.content === "string" &&
            /Phát trực tiếp|livestream/i.test(p.content)
          ) {
            liveIncome += price
          }
          // hộp
          if (p.box) {
            boxMap[p.box] = (boxMap[p.box] || 0) + (p.quantity || 0)
          }
        }
      }

      const boxes = Object.entries(boxMap)
        .map(([box, quantity]) => ({ box, quantity }))
        .sort((a, b) => a.box.localeCompare(b.box))

      const shippingProviders = Object.entries(shipMap)
        .map(([provider, orders]) => ({ provider, orders }))
        .sort((a, b) => b.orders - a.orders)

      return {
        boxes,
        totalIncome,
        sources: sourceTotals,
        liveIncome,
        shippingProviders
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính thống kê ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getTopCreators(
    startDate: Date,
    endDate: Date
  ): Promise<{
    affiliate: { creator: string; totalIncome: number; percentage: number }[]
    affiliateAds: { creator: string; totalIncome: number; percentage: number }[]
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const rows: Array<{
        _id: { source: string; creator: string }
        totalIncome: number
      }> = await this.incomeModel.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $unwind: "$products" },
        {
          $match: { "products.source": { $in: ["affiliate", "affiliate-ads"] } }
        },
        {
          $group: {
            _id: {
              source: "$products.source",
              creator: { $ifNull: ["$products.creator", "(unknown)"] }
            },
            totalIncome: { $sum: { $ifNull: ["$products.price", 0] } }
          }
        }
      ])

      const bySource: Record<
        string,
        { creator: string; totalIncome: number }[]
      > = {
        affiliate: [],
        "affiliate-ads": []
      }
      for (const r of rows) {
        bySource[r._id.source].push({
          creator: r._id.creator,
          totalIncome: r.totalIncome
        })
      }

      // Tính tổng của từng source (toàn bộ creators của source đó)
      const sourceTotals: Record<string, number> = {
        affiliate: bySource["affiliate"].reduce((s, v) => s + v.totalIncome, 0),
        "affiliate-ads": bySource["affiliate-ads"].reduce(
          (s, v) => s + v.totalIncome,
          0
        )
      }

      function buildTop(
        arr: { creator: string; totalIncome: number }[],
        totalSource: number
      ): { creator: string; totalIncome: number; percentage: number }[] {
        return arr
          .sort((a, b) => b.totalIncome - a.totalIncome)
          .slice(0, 10)
          .map((x) => ({
            creator: x.creator,
            totalIncome: x.totalIncome,
            // phần trăm trên tổng của chính source đó
            percentage:
              totalSource === 0
                ? 0
                : Math.round((x.totalIncome / totalSource) * 100 * 100) / 100
          }))
      }

      return {
        affiliate: buildTop(bySource["affiliate"], sourceTotals["affiliate"]),
        affiliateAds: buildTop(
          bySource["affiliate-ads"],
          sourceTotals["affiliate-ads"]
        )
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính top nhà sáng tạo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async resetSourceChecked(date: Date): Promise<{ updated: number }> {
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      const incomes = await this.incomeModel.find({
        date: { $gte: start, $lte: end }
      })

      let updated = 0
      for (const income of incomes) {
        let needSave = false
        for (const p of income.products) {
          if (p.sourceChecked) {
            p.sourceChecked = false
            needSave = true
            updated++
          }
        }
        if (needSave) await income.save()
      }
      return { updated }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi reset sourceChecked",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private splitByChannel(products: Income["products"]) {
    const isLive = (p: any) =>
      typeof p.content === "string" &&
      /Phát trực tiếp|livestream/i.test(p.content)
    const live = products.filter(isLive)
    const shop = products.filter((p) => !isLive(p))
    return { live, shop }
  }

  private sumProductsAmount(products: any[]) {
    return products.reduce((sum, p) => sum + (p.price || 0), 0)
  }

  private sumProductsQuantity(products: any[]) {
    return products.reduce((sum, p) => sum + (p.quantity || 0), 0)
  }

  private getShippingProviderName(
    row: Record<string, any>
  ): string | undefined {
    if (!row) return undefined
    const directKeys = [
      "Shipping Provider Name",
      "Shipping Provider",
      "Đơn vị vận chuyển",
      "Tên đơn vị vận chuyển",
      "Logistics Service Provider",
      "Carrier"
    ]

    for (const k of directKeys) {
      if (row[k]) return String(row[k])
    }

    const key = Object.keys(row).find((k) =>
      k.toLowerCase().includes("shipping provider")
    )
    return key ? String(row[key]) : undefined
  }
}
