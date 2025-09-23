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
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import { format as formatDateFns } from "date-fns"
import { OWN_USERS } from "../constants/own-users"

@Injectable()
export class IncomeService {
  constructor(
    @InjectModel("incomes")
    private readonly incomeModel: Model<Income>,
    @InjectModel("monthgoals")
    private readonly monthGoalModel: Model<MonthGoal>,
    private readonly packingRulesService: PackingRulesService,
    @InjectModel("dailyads")
    private readonly dailyAdsModel: Model<DailyAds>
  ) {}

  /** @deprecated */
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
      // Build bulk ops để tránh await nhiều lần
      const bulkOps: any[] = []
      for (const income of incomes) {
        const filtered = (income.products || []).filter(
          (p) => p.source !== dto.type
        )
        if (filtered.length === 0) {
          bulkOps.push({ deleteOne: { filter: { _id: income._id } } })
        } else if (filtered.length < (income.products || []).length) {
          bulkOps.push({
            updateOne: {
              filter: { _id: income._id },
              update: { $set: { products: filtered } }
            }
          })
        }
      }
      if (bulkOps.length > 0) {
        await this.incomeModel.bulkWrite(bulkOps, { ordered: false })
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

      const inserts: any[] = []
      const updateOps: any[] = []
      for (const orderId in newIncomesMap) {
        const lines = newIncomesMap[orderId]
        const shippingProvider = this.getShippingProviderName(lines[0] as any)
        if (existedOrderIds.has(orderId)) {
          // Đã tồn tại: update thêm products mới cho đúng logic
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
          const upd: any = {}
          if (newProducts.length > 0)
            upd.$push = { products: { $each: newProducts } }
          if (shippingProvider) upd.$set = { shippingProvider }
          if (Object.keys(upd).length > 0) {
            updateOps.push({
              updateOne: {
                filter: { orderId, date: { $gte: start, $lte: end } },
                update: upd
              }
            })
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
          inserts.push({
            orderId,
            customer: lines[0]["Buyer Username"],
            province: lines[0]["Province"],
            shippingProvider,
            date: dto.date,
            products
          })
        }
      }
      if (updateOps.length)
        await this.incomeModel.bulkWrite(updateOps, { ordered: false })
      if (inserts.length)
        await this.incomeModel.insertMany(inserts, { ordered: false })

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

      for (const line of data) {
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
            foundProduct.source = OWN_USERS.includes(
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
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật loại affiliate",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /** @deprecated */
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
      const filter: Record<string, any> = {
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
            "Ngày xuất đơn":
              idx === 0 ? this.formatDate(income.date as Date) : "",
            "Mã đơn hàng": idx === 0 ? income.orderId : "",
            "Khách hàng": idx === 0 ? income.customer : "",
            "Tỉnh thành": idx === 0 ? income.province : "",
            "Đơn vị vận chuyển": idx === 0 ? income.shippingProvider || "" : "",
            "Mã SP": product.code,
            "Tên SP": product.name,
            Nguồn: sourcesMap[product.source],
            "Số lượng": product.quantity,
            "Báo giá": this.formatMoney(product.quotation),
            "Giá bán": this.formatMoney(product.price),
            "Phần trăm Affiliate": product.affiliateAdsPercentage ?? "",
            "Phần trăm Affiliate tiêu chuẩn":
              product.standardAffPercentage ?? "",
            "Loại nội dung": product.content ?? "",
            "Quy cách đóng hộp": packingTypesMap[product.box ?? ""],
            "Nhà sáng tạo": product.creator ?? "",
            "Thanh toán hoa hồng Quảng cáo cửa hàng ước tính": this.formatMoney(
              product.affiliateAdsAmount
            ),
            "Thanh toán hoa hồng tiêu chuẩn ước tính": this.formatMoney(
              product.standardAffAmount
            )
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
    videoIncome: number
    shippingProviders: { provider: string; orders: number }[]
    dailyAds?: { liveAdsCost: number; videoAdsCost: number }
    percentages?: {
      liveAdsToLiveIncome: number
      videoAdsToVideoIncome: number
    }
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
      let videoIncome = 0
      const sourceTotals = { ads: 0, affiliate: 0, affiliateAds: 0, other: 0 }

      for (const income of incomes) {
        const provider = income.shippingProvider || "(unknown)"
        shipMap[provider] = (shipMap[provider] || 0) + 1

        for (const p of income.products || []) {
          const price = p.price || 0
          totalIncome += price
          if (p.source === "ads") sourceTotals.ads += price
          else if (p.source === "affiliate") sourceTotals.affiliate += price
          else if (p.source === "affiliate-ads")
            sourceTotals.affiliateAds += price
          else sourceTotals.other += price

          if (typeof p.content === "string") {
            if (/Phát trực tiếp|livestream/i.test(p.content)) {
              liveIncome += price
            } else if (/video/i.test(p.content)) {
              videoIncome += price
            }
          }

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

      // Fetch daily ads by exact date (same day)
      const dailyAds = await this.dailyAdsModel
        .findOne({
          date: { $gte: start, $lte: end }
        })
        .lean()

      const liveAdsCost = dailyAds?.liveAdsCost || 0
      const videoAdsCost = dailyAds?.videoAdsCost || 0

      const percentages = {
        liveAdsToLiveIncome:
          liveIncome === 0
            ? 0
            : Math.round((liveAdsCost / liveIncome) * 10000) / 100,
        videoAdsToVideoIncome:
          videoIncome === 0
            ? 0
            : Math.round((videoAdsCost / videoIncome) * 10000) / 100
      }

      return {
        boxes,
        totalIncome,
        sources: sourceTotals,
        liveIncome,
        videoIncome,
        shippingProviders,
        dailyAds: { liveAdsCost, videoAdsCost },
        percentages
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

  async totalLiveAndVideoIncomeByMonth(
    month: number,
    year: number
  ): Promise<{ live: number; video: number }> {
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999)
      const incomes = await this.incomeModel
        .find({ date: { $gte: start, $lte: end } })
        .lean()

      let live = 0
      let video = 0
      for (const income of incomes) {
        for (const p of income.products || []) {
          const price = p.price || 0
          if (typeof p.content === "string") {
            if (/Phát trực tiếp|livestream/i.test(p.content)) live += price
            else if (/video/i.test(p.content)) video += price
          }
        }
      }
      return { live, video }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính doanh thu live/video theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async adsCostSplitByMonth(
    month: number,
    year: number
  ): Promise<{
    liveAdsCost: number
    videoAdsCost: number
    percentages: {
      liveAdsToLiveIncome: number
      videoAdsToVideoIncome: number
    }
    totalIncome: { live: number; video: number }
  }> {
    try {
      const start = new Date(year, month, 1)
      const end = new Date(year, month + 1, 0, 23, 59, 59, 999)

      // Sum daily ads cost in month
      const rows = await this.dailyAdsModel
        .aggregate([
          { $match: { date: { $gte: start, $lte: end } } },
          {
            $group: {
              _id: null,
              liveAdsCost: { $sum: { $ifNull: ["$liveAdsCost", 0] } },
              videoAdsCost: { $sum: { $ifNull: ["$videoAdsCost", 0] } }
            }
          }
        ])
        .exec()

      const liveAdsCost = rows?.[0]?.liveAdsCost || 0
      const videoAdsCost = rows?.[0]?.videoAdsCost || 0

      // Get total live/video incomes in month
      const { live, video } = await this.totalLiveAndVideoIncomeByMonth(
        month,
        year
      )

      const percentages = {
        liveAdsToLiveIncome:
          live === 0 ? 0 : Math.round((liveAdsCost / live) * 10000) / 100,
        videoAdsToVideoIncome:
          video === 0 ? 0 : Math.round((videoAdsCost / video) * 10000) / 100
      }

      return {
        liveAdsCost,
        videoAdsCost,
        percentages,
        totalIncome: { live, video }
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính chi phí quảng cáo theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getRangeStats(
    startDate: Date,
    endDate: Date,
    comparePrevious = true
  ): Promise<{
    period: { startDate: Date; endDate: Date; days: number }
    current: {
      totalIncome: number
      liveIncome: number
      videoIncome: number
      ownVideoIncome: number
      otherVideoIncome: number
      otherIncome: number
      sources: {
        ads: number
        affiliate: number
        affiliateAds: number
        other: number
      }
      boxes: { box: string; quantity: number }[]
      shippingProviders: { provider: string; orders: number }[]
      ads: {
        liveAdsCost: number
        videoAdsCost: number
        percentages: {
          liveAdsToLiveIncome: number
          videoAdsToVideoIncome: number
        }
      }
    }
    changes?: {
      totalIncomePct: number
      liveIncomePct: number
      videoIncomePct: number
      ownVideoIncomePct: number
      otherVideoIncomePct: number
      sources: {
        adsPct: number
        affiliatePct: number
        affiliateAdsPct: number
        otherPct: number
      }
      ads: {
        liveAdsCostPct: number
        videoAdsCostPct: number
        liveAdsToLiveIncomePctDiff: number
        videoAdsToVideoIncomePctDiff: number
      }
    }
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      if (end < start)
        throw new HttpException(
          "Khoảng ngày không hợp lệ",
          HttpStatus.BAD_REQUEST
        )
      const days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1

      const buildStats = async (s: Date, e: Date) => {
        const incomes = await this.incomeModel
          .find({ date: { $gte: s, $lte: e } })
          .lean()
        const boxMap: Record<string, number> = {}
        const shipMap: Record<string, number> = {}
        let totalIncome = 0
        let liveIncome = 0
        let ownVideoIncome = 0
        let otherVideoIncome = 0
        const sources = { ads: 0, affiliate: 0, affiliateAds: 0, other: 0 }
        for (const income of incomes) {
          const provider = income.shippingProvider || "(unknown)"
          shipMap[provider] = (shipMap[provider] || 0) + 1
          for (const p of income.products || []) {
            const price = p.price || 0
            totalIncome += price
            if (p.source === "ads") sources.ads += price
            else if (p.source === "affiliate") sources.affiliate += price
            else if (p.source === "affiliate-ads") sources.affiliateAds += price
            else sources.other += price
            if (typeof p.content === "string") {
              if (/Phát trực tiếp|livestream/i.test(p.content)) {
                liveIncome += price
              } else if (/video/i.test(p.content)) {
                const creator = p.creator
                if (creator && OWN_USERS.includes(String(creator)))
                  ownVideoIncome += price
                else otherVideoIncome += price
              }
            }
            if (p.box) boxMap[p.box] = (boxMap[p.box] || 0) + (p.quantity || 0)
          }
        }
        const videoIncome = ownVideoIncome + otherVideoIncome
        const otherIncome = totalIncome - videoIncome - liveIncome
        const boxes = Object.entries(boxMap)
          .map(([box, quantity]) => ({ box, quantity }))
          .sort((a, b) => a.box.localeCompare(b.box))
        const shippingProviders = Object.entries(shipMap)
          .map(([provider, orders]) => ({ provider, orders }))
          .sort((a, b) => b.orders - a.orders)
        const adsAgg = await this.dailyAdsModel
          .aggregate([
            { $match: { date: { $gte: s, $lte: e } } },
            {
              $group: {
                _id: null,
                liveAdsCost: { $sum: { $ifNull: ["$liveAdsCost", 0] } },
                videoAdsCost: { $sum: { $ifNull: ["$videoAdsCost", 0] } }
              }
            }
          ])
          .exec()
        const liveAdsCost = adsAgg?.[0]?.liveAdsCost || 0
        const videoAdsCost = adsAgg?.[0]?.videoAdsCost || 0
        const percentages = {
          liveAdsToLiveIncome:
            liveIncome === 0
              ? 0
              : Math.round((liveAdsCost / liveIncome) * 10000) / 100,
          videoAdsToVideoIncome:
            videoIncome === 0
              ? 0
              : Math.round((videoAdsCost / videoIncome) * 10000) / 100
        }
        return {
          totalIncome,
          liveIncome,
          videoIncome,
          ownVideoIncome,
          otherVideoIncome,
          otherIncome,
          sources,
          boxes,
          shippingProviders,
          ads: { liveAdsCost, videoAdsCost, percentages }
        }
      }

      const current = await buildStats(start, end)
      if (!comparePrevious)
        return { period: { startDate: start, endDate: end, days }, current }

      const prevEnd = new Date(start.getTime() - 86400000)
      const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
      const previous = await buildStats(prevStart, prevEnd)
      const pct = (cur: number, prev: number) =>
        prev === 0
          ? cur === 0
            ? 0
            : 100
          : Math.round(((cur - prev) / prev) * 10000) / 100

      const changes = {
        totalIncomePct: pct(current.totalIncome, previous.totalIncome),
        liveIncomePct: pct(current.liveIncome, previous.liveIncome),
        videoIncomePct: pct(current.videoIncome, previous.videoIncome),
        ownVideoIncomePct: pct(current.ownVideoIncome, previous.ownVideoIncome),
        otherVideoIncomePct: pct(
          current.otherVideoIncome,
          previous.otherVideoIncome
        ),
        sources: {
          adsPct: pct(current.sources.ads, previous.sources.ads),
          affiliatePct: pct(
            current.sources.affiliate,
            previous.sources.affiliate
          ),
          affiliateAdsPct: pct(
            current.sources.affiliateAds,
            previous.sources.affiliateAds
          ),
          otherPct: pct(current.sources.other, previous.sources.other)
        },
        ads: {
          liveAdsCostPct: pct(
            current.ads.liveAdsCost,
            previous.ads.liveAdsCost
          ),
          videoAdsCostPct: pct(
            current.ads.videoAdsCost,
            previous.ads.videoAdsCost
          ),
          liveAdsToLiveIncomePctDiff:
            Math.round(
              (current.ads.percentages.liveAdsToLiveIncome -
                previous.ads.percentages.liveAdsToLiveIncome) *
                100
            ) / 100,
          videoAdsToVideoIncomePctDiff:
            Math.round(
              (current.ads.percentages.videoAdsToVideoIncome -
                previous.ads.percentages.videoAdsToVideoIncome) *
                100
            ) / 100
        }
      }

      return {
        period: { startDate: start, endDate: end, days },
        current,
        changes
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính thống kê chuỗi ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async insertAndUpdateAffiliateType(dto: {
    totalIncomeFile: Express.Multer.File
    affiliateFile: Express.Multer.File
    date: Date
  }): Promise<void> {
    try {
      // 1. Xử lý file tổng doanh thu: insert với source trống
      const totalWorkbook = XLSX.read(dto.totalIncomeFile.buffer, {
        type: "buffer"
      })
      const totalSheetName = totalWorkbook.SheetNames[0]
      const totalSheet = totalWorkbook.Sheets[totalSheetName]
      const totalReadData = XLSX.utils.sheet_to_json(
        totalSheet
      ) as XlsxIncomeData[]
      const totalData = totalReadData
        .slice(1)
        .filter((line) => line["Cancelation/Return Type"] !== "Cancel")

      const start = new Date(dto.date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(dto.date)
      end.setHours(23, 59, 59, 999)

      // Xóa toàn bộ incomes trong ngày (vì là file tổng)
      await this.incomeModel.deleteMany({
        date: { $gte: start, $lte: end }
      })

      // Group data
      const newIncomesMap = totalData.reduce(
        (acc, line) => {
          const orderId = line["Order ID"]
          if (!acc[orderId]) acc[orderId] = []
          acc[orderId].push(line)
          return acc
        },
        {} as Record<string, XlsxIncomeData[]>
      )

      const inserts: any[] = []
      for (const orderId in newIncomesMap) {
        const lines = newIncomesMap[orderId]
        const shippingProvider = this.getShippingProviderName(lines[0] as any)
        const products = lines.map((line) => ({
          code: line["Seller SKU"],
          name: line["Product Name"],
          source: "other",
          quantity: line["Quantity"],
          quotation: line["SKU Unit Original Price"],
          price: line["SKU Subtotal Before Discount"],
          sourceChecked: false
        }))
        inserts.push({
          orderId,
          customer: lines[0]["Buyer Username"],
          province: lines[0]["Province"],
          shippingProvider,
          date: dto.date,
          products
        })
      }
      if (inserts.length)
        await this.incomeModel.insertMany(inserts, { ordered: false })

      // Cập nhật quy cách đóng hộp
      await this.updateIncomesBox(new Date(dto.date))

      // 2. Xử lý file affiliate: update source
      const affiliateWorkbook = XLSX.read(dto.affiliateFile.buffer, {
        type: "buffer"
      })
      const affiliateSheetName = affiliateWorkbook.SheetNames[0]
      const affiliateSheet = affiliateWorkbook.Sheets[affiliateSheetName]
      const affiliateData = XLSX.utils.sheet_to_json(
        affiliateSheet
      ) as XlsxAffiliateData[]

      for (const line of affiliateData) {
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
            foundProduct.source = OWN_USERS.includes(
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
            if (existedOrder.orderId === "580137965604931583") {
              console.log(foundProduct.source, foundProduct)
            }
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
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xử lý file tổng doanh thu và affiliate",
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

  private formatDate(d: Date): string {
    if (!(d instanceof Date) || isNaN(d.getTime())) return ""
    try {
      return formatDateFns(d, "dd/MM/yyyy")
    } catch {
      return ""
    }
  }

  private formatMoney(v: any): string {
    if (v === undefined || v === null || v === "") return ""
    const num = Number(v)
    if (isNaN(num)) return ""
    return new Intl.NumberFormat("vi-VN").format(num)
  }
}
