import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { Income } from "../database/mongoose/schemas/Income"
import {
  InsertIncomeFileDto,
  UpdateAffiliateTypeDto,
  XlsxAffiliateData,
  XlsxIncomeData
} from "./dto/income.dto"
import * as XLSX from "xlsx"
import * as ExcelJS from "exceljs"
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
              platformDiscount: line["SKU Platform Discount"],
              sellerDiscount: line["SKU Seller Discount"],
              priceAfterDiscount: line["SKU Subtotal After Discount"],
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
                platformDiscount: line["SKU Platform Discount"],
                sellerDiscount: line["SKU Seller Discount"],
                priceAfterDiscount: line["SKU Subtotal After Discount"],
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
            platformDiscount: line["SKU Platform Discount"] || 0,
            sellerDiscount: line["SKU Seller Discount"] || 0,
            priceAfterDiscount: line["SKU Subtotal After Discount"] || 0,
            sourceChecked: false
          }))
          inserts.push({
            orderId,
            customer: lines[0]["Buyer Username"],
            province: lines[0]["Province"],
            shippingProvider,
            channel: dto.channel,
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

            const affiliateAdsPercentage = Number(
              line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
            )
            foundProduct.affiliateAdsPercentage = isNaN(affiliateAdsPercentage)
              ? 0
              : affiliateAdsPercentage

            const affiliateAdsAmount = Number(
              line["Thanh toán hoa hồng Quảng cáo cửa hàng ước tính"]
            )
            foundProduct.affiliateAdsAmount = isNaN(affiliateAdsAmount)
              ? 0
              : affiliateAdsAmount

            const standardAffPercentage = Number(
              line["Tỷ lệ hoa hồng tiêu chuẩn"]
            )
            foundProduct.standardAffPercentage = isNaN(standardAffPercentage)
              ? 0
              : standardAffPercentage

            const standardAffAmount = Number(
              line["Thanh toán hoa hồng tiêu chuẩn ước tính"]
            )
            foundProduct.standardAffAmount = isNaN(standardAffAmount)
              ? 0
              : standardAffAmount

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
    productSource?: string,
    channelId?: string
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
      if (channelId) filter.channel = channelId

      const total = await this.incomeModel.countDocuments(filter)

      const incomes = await this.incomeModel
        .find(filter)
        .populate("channel", "_id name")
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
        const productsArr = income.products || []

        // Build products array for getPackingType
        const productsForPacking = productsArr.map((p) => ({
          productCode: p.code,
          quantity: p.quantity
        }))

        // Get packing type for this combination of products
        const boxType =
          await this.packingRulesService.getPackingType(productsForPacking)

        // If a matching rule is found, update all products in the order
        if (boxType) {
          let needSave = false

          for (const product of productsArr) {
            if (product.box !== boxType) {
              product.box = boxType
              needSave = true
            }
          }

          if (needSave) {
            await income.save()
          }
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
    year: number,
    channelId?: string
  ): Promise<{
    beforeDiscount: { live: number; shop: number }
    afterDiscount: { live: number; shop: number }
  }> {
    try {
      // Adjust for GMT+7 timezone (Vietnam time)
      // Create dates in UTC then adjust to match Vietnam timezone
      const start = new Date(Date.UTC(year, month, 1))
      start.setUTCHours(start.getUTCHours() - 7) // Subtract 7 hours to get GMT+7 start in UTC

      const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      end.setUTCHours(end.getUTCHours() - 7) // Subtract 7 hours to get GMT+7 end in UTC

      const filter: any = { date: { $gte: start, $lte: end } }
      if (channelId) filter.channel = channelId

      const incomes = await this.incomeModel.find(filter).lean()

      let liveBeforeDiscount = 0
      let shopBeforeDiscount = 0
      let liveAfterDiscount = 0
      let shopAfterDiscount = 0

      for (const income of incomes) {
        const { live: liveProducts, shop: shopProducts } = this.splitByChannel(
          income.products || []
        )
        liveBeforeDiscount += this.sumProductsAmountBeforeDiscount(liveProducts)
        shopBeforeDiscount += this.sumProductsAmountBeforeDiscount(shopProducts)

        // CHỈ TRỪ SELLER DISCOUNT, KHÔNG TRỪ PLATFORM DISCOUNT
        liveAfterDiscount +=
          this.sumProductsAmountAfterSellerDiscount(liveProducts)
        shopAfterDiscount +=
          this.sumProductsAmountAfterSellerDiscount(shopProducts)
      }

      return {
        beforeDiscount: { live: liveBeforeDiscount, shop: shopBeforeDiscount },
        afterDiscount: { live: liveAfterDiscount, shop: shopAfterDiscount }
      }
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
    year: number,
    channelId?: string
  ): Promise<{ live: number; shop: number }> {
    try {
      // Adjust for GMT+7 timezone (Vietnam time)
      const start = new Date(Date.UTC(year, month, 1))
      start.setUTCHours(start.getUTCHours() - 7)

      const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      end.setUTCHours(end.getUTCHours() - 7)

      const filter: any = { date: { $gte: start, $lte: end } }
      if (channelId) filter.channel = channelId

      const incomes = await this.incomeModel.find(filter).lean()

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
    year: number,
    channelId?: string
  ): Promise<{ live: number; shop: number }> {
    try {
      const filter: any = { month, year }
      if (channelId) filter.channel = channelId

      const goal = await this.monthGoalModel.findOne(filter).lean()
      if (!goal) {
        throw new HttpException(
          "Chưa thiết lập mục tiêu tháng/channel này",
          HttpStatus.NOT_FOUND
        )
      }

      const totalIncome = await this.totalIncomeByMonthSplit(
        month,
        year,
        channelId
      )
      const live = totalIncome.afterDiscount.live
      const shop = totalIncome.afterDiscount.shop
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
    orderId?: string,
    productCode?: string,
    productSource?: string
  ): Promise<Buffer> {
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
      } as const

      const sourcesMap = {
        ads: "ADS",
        affiliate: "AFFILIATE",
        "affiliate-ads": "AFFILIATE ADS",
        other: "KHÁC"
      } as const

      const filter: Record<string, any> = {
        date: { $gte: start, $lte: end }
      }
      if (orderId) filter.orderId = String(orderId).trim()
      if (productCode) filter["products.code"] = productCode
      if (productSource) filter["products.source"] = productSource

      const incomes = await this.incomeModel
        .find(filter)
        .populate("channel", "_id name")
        .sort({ date: 1, _id: 1 })
        .lean()

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet("DoanhThu")

      worksheet.columns = [
        { header: "Ngày xuất đơn", key: "date", width: 15 },
        { header: "Mã đơn hàng", key: "orderId", width: 20 },
        { header: "Khách hàng", key: "customer", width: 25 },
        { header: "Tỉnh thành", key: "province", width: 20 },
        { header: "Kênh", key: "channel", width: 20 },
        { header: "Đơn vị vận chuyển", key: "shippingProvider", width: 20 },
        { header: "Mã SP", key: "code", width: 15 },
        { header: "Tên SP", key: "name", width: 30 },
        { header: "Nguồn", key: "source", width: 15 },
        { header: "Số lượng", key: "quantity", width: 12 },
        { header: "Báo giá", key: "quotation", width: 15 },
        { header: "Giá bán", key: "price", width: 15 },
        { header: "Giảm giá từ platform", key: "platformDiscount", width: 20 },
        { header: "Giảm giá từ người bán", key: "sellerDiscount", width: 20 },
        {
          header: "Giá sau giảm voucher",
          key: "priceAfterDiscount",
          width: 20
        },
        {
          header: "Phần trăm Affiliate",
          key: "affiliateAdsPercentage",
          width: 20
        },
        {
          header: "Phần trăm Affiliate tiêu chuẩn",
          key: "standardAffPercentage",
          width: 25
        },
        { header: "Loại nội dung", key: "content", width: 20 },
        { header: "Quy cách đóng hộp", key: "box", width: 20 },
        { header: "Nhà sáng tạo", key: "creator", width: 20 },
        {
          header: "Thanh toán hoa hồng Quảng cáo cửa hàng ước tính",
          key: "affiliateAdsAmount",
          width: 35
        },
        {
          header: "Thanh toán hoa hồng tiêu chuẩn ước tính",
          key: "standardAffAmount",
          width: 35
        }
      ]

      const mergeCells: Array<{
        startRow: number
        endRow: number
        colIndex: number
      }> = []

      let currentRow = 2

      incomes.forEach((income) => {
        const startRow = currentRow
        const channelName = (income.channel as any)?.name || ""

        income.products.forEach((product, idx) => {
          worksheet.addRow([
            idx === 0 ? this.formatDate(income.date as Date) : "",
            idx === 0 ? income.orderId : "",
            idx === 0 ? income.customer : "",
            idx === 0 ? income.province : "",
            idx === 0 ? channelName : "",
            idx === 0 ? income.shippingProvider || "" : "",
            product.code,
            product.name,
            sourcesMap[product.source],
            product.quantity,
            this.formatMoney(product.quotation),
            this.formatMoney(product.price),
            this.formatMoney(product.platformDiscount),
            this.formatMoney(product.sellerDiscount),
            this.formatMoney(product.priceAfterDiscount),
            product.affiliateAdsPercentage ?? "",
            product.standardAffPercentage ?? "",
            product.content ?? "",
            packingTypesMap[product.box ?? ""],
            product.creator ?? "",
            this.formatMoney(product.affiliateAdsAmount),
            this.formatMoney(product.standardAffAmount)
          ])
          currentRow++
        })

        if (income.products.length > 1) {
          for (let colIdx = 0; colIdx < 6; colIdx++) {
            mergeCells.push({
              startRow,
              endRow: currentRow - 1,
              colIndex: colIdx + 1
            })
          }
        }
      })

      mergeCells.forEach((merge) => {
        worksheet.mergeCells(
          merge.startRow,
          merge.colIndex,
          merge.endRow,
          merge.colIndex
        )
      })

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.font = { name: "Times New Roman", size: 11 }
          cell.alignment = { vertical: "middle", horizontal: "left" }
        })
      })

      const buffer = await workbook.xlsx.writeBuffer()
      return Buffer.from(buffer)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xuất file doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getTopCreators(
    startDate: Date,
    endDate: Date
  ): Promise<{
    affiliate: {
      beforeDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
      afterDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
    }
    affiliateAds: {
      beforeDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
      afterDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
    }
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const rows: Array<{
        _id: { source: string; creator: string }
        totalIncomeBeforeDiscount: number
        totalIncomeAfterDiscount: number
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
            totalIncomeBeforeDiscount: {
              $sum: { $ifNull: ["$products.price", 0] }
            },
            totalIncomeAfterDiscount: {
              $sum: {
                $ifNull: [
                  {
                    $ifNull: ["$products.priceAfterDiscount", "$products.price"]
                  },
                  0
                ]
              }
            }
          }
        }
      ])

      const bySourceBeforeDiscount: Record<
        string,
        { creator: string; totalIncome: number }[]
      > = {
        affiliate: [],
        "affiliate-ads": []
      }

      const bySourceAfterDiscount: Record<
        string,
        { creator: string; totalIncome: number }[]
      > = {
        affiliate: [],
        "affiliate-ads": []
      }

      for (const r of rows) {
        bySourceBeforeDiscount[r._id.source].push({
          creator: r._id.creator,
          totalIncome: r.totalIncomeBeforeDiscount
        })
        bySourceAfterDiscount[r._id.source].push({
          creator: r._id.creator,
          totalIncome: r.totalIncomeAfterDiscount
        })
      }

      // Tính tổng của từng source (toàn bộ creators của source đó)
      const sourceTotalsBeforeDiscount: Record<string, number> = {
        affiliate: bySourceBeforeDiscount["affiliate"].reduce(
          (s, v) => s + v.totalIncome,
          0
        ),
        "affiliate-ads": bySourceBeforeDiscount["affiliate-ads"].reduce(
          (s, v) => s + v.totalIncome,
          0
        )
      }

      const sourceTotalsAfterDiscount: Record<string, number> = {
        affiliate: bySourceAfterDiscount["affiliate"].reduce(
          (s, v) => s + v.totalIncome,
          0
        ),
        "affiliate-ads": bySourceAfterDiscount["affiliate-ads"].reduce(
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
        affiliate: {
          beforeDiscount: buildTop(
            bySourceBeforeDiscount["affiliate"],
            sourceTotalsBeforeDiscount["affiliate"]
          ),
          afterDiscount: buildTop(
            bySourceAfterDiscount["affiliate"],
            sourceTotalsAfterDiscount["affiliate"]
          )
        },
        affiliateAds: {
          beforeDiscount: buildTop(
            bySourceBeforeDiscount["affiliate-ads"],
            sourceTotalsBeforeDiscount["affiliate-ads"]
          ),
          afterDiscount: buildTop(
            bySourceAfterDiscount["affiliate-ads"],
            sourceTotalsAfterDiscount["affiliate-ads"]
          )
        }
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

  async totalLiveAndShopIncomeByMonth(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{
    beforeDiscount: { live: number; shop: number }
    afterDiscount: { live: number; shop: number }
  }> {
    try {
      // Adjust for GMT+7 timezone (Vietnam time)
      const start = new Date(Date.UTC(year, month, 1))
      start.setUTCHours(start.getUTCHours() - 7)

      const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      end.setUTCHours(end.getUTCHours() - 7)

      const filter: any = { date: { $gte: start, $lte: end } }
      if (channelId) filter.channel = channelId

      const incomes = await this.incomeModel.find(filter).lean()

      let liveBeforeDiscount = 0
      let shopBeforeDiscount = 0
      let liveAfterDiscount = 0
      let shopAfterDiscount = 0

      for (const income of incomes) {
        for (const p of income.products || []) {
          const priceBeforeDiscount = p.price || 0
          const sellerDiscount = p.sellerDiscount || 0
          // CHỈ TRỪ SELLER DISCOUNT, KHÔNG TRỪ PLATFORM DISCOUNT
          const priceAfterSellerDiscount = priceBeforeDiscount - sellerDiscount

          // Split by channel: live vs shop (non-livestream)
          if (
            typeof p.content === "string" &&
            /Phát trực tiếp|livestream/i.test(p.content)
          ) {
            liveBeforeDiscount += priceBeforeDiscount
            liveAfterDiscount += priceAfterSellerDiscount
          } else {
            // Everything else is considered "shop"
            shopBeforeDiscount += priceBeforeDiscount
            shopAfterDiscount += priceAfterSellerDiscount
          }
        }
      }

      return {
        beforeDiscount: {
          live: liveBeforeDiscount,
          shop: shopBeforeDiscount
        },
        afterDiscount: { live: liveAfterDiscount, shop: shopAfterDiscount }
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính doanh thu live/shop theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async adsCostSplitByMonth(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{
    liveAdsCost: number
    shopAdsCost: number
    percentages: {
      liveAdsToLiveIncome: number
      shopAdsToShopIncome: number
    }
    totalIncome: { live: number; shop: number }
  }> {
    try {
      // Adjust for GMT+7 timezone (Vietnam time)
      const start = new Date(Date.UTC(year, month, 1))
      start.setDate(start.getDate() - 1)

      const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      end.setDate(end.getDate() - 1)

      // Sum daily ads cost in month
      const adsFilter: any = { date: { $gte: start, $lte: end } }
      if (channelId) {
        adsFilter.channel = new Types.ObjectId(channelId)
      }

      const rows = await this.dailyAdsModel
        .aggregate([
          { $match: adsFilter },
          {
            $group: {
              _id: null,
              liveAdsCost: { $sum: { $ifNull: ["$liveAdsCost", 0] } },
              shopAdsCost: { $sum: { $ifNull: ["$shopAdsCost", 0] } }
            }
          }
        ])
        .exec()

      const liveAdsCost = rows?.[0]?.liveAdsCost || 0
      const shopAdsCost = rows?.[0]?.shopAdsCost || 0

      // Get total live/shop incomes in month
      const totalLiveShop = await this.totalLiveAndShopIncomeByMonth(
        month,
        year,
        channelId
      )
      const live = totalLiveShop.afterDiscount.live
      const shop = totalLiveShop.afterDiscount.shop

      const percentages = {
        liveAdsToLiveIncome:
          live === 0 ? 0 : Math.round((liveAdsCost / live) * 10000) / 100,
        shopAdsToShopIncome:
          shop === 0 ? 0 : Math.round((shopAdsCost / shop) * 10000) / 100
      }

      return {
        liveAdsCost,
        shopAdsCost,
        percentages,
        totalIncome: { live, shop }
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
    channelId: string,
    comparePrevious = true
  ): Promise<{
    period: { startDate: Date; endDate: Date; days: number }
    current: {
      beforeDiscount: {
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
      }
      afterDiscount: {
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
      }
      boxes: { box: string; quantity: number }[]
      shippingProviders: { provider: string; orders: number }[]
      ads: {
        liveAdsCost: number
        shopAdsCost: number
        percentages: {
          liveAdsToLiveIncome: number
          shopAdsToShopIncome: number
        }
      }
      discounts: {
        totalPlatformDiscount: number
        totalSellerDiscount: number
        totalDiscount: number
        avgDiscountPerOrder: number
        discountPercentage: number
      }
      productsQuantity: {
        [code: string]: number
      }
    }
    changes?: {
      beforeDiscount: {
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
      }
      afterDiscount: {
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
      }
      ads: {
        liveAdsCostPct: number
        shopAdsCostPct: number
        liveAdsToLiveIncomePctDiff: number
        shopAdsToShopIncomePctDiff: number
      }
      discounts: {
        totalPlatformDiscountPct: number
        totalSellerDiscountPct: number
        totalDiscountPct: number
        avgDiscountPerOrderPct: number
        discountPercentageDiff: number
      }
    }
  }> {
    try {
      if (!channelId) {
        throw new HttpException("channelId là bắt buộc", HttpStatus.BAD_REQUEST)
      }

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
        const filter: any = { date: { $gte: s, $lte: e } }
        if (channelId) filter.channel = channelId

        const incomes = await this.incomeModel.find(filter).lean()
        const boxMap: Record<string, number> = {}
        const shipMap: Record<string, number> = {}

        // Before discount stats
        let totalIncomeBeforeDiscount = 0
        let liveIncomeBeforeDiscount = 0
        let ownVideoIncomeBeforeDiscount = 0
        let otherVideoIncomeBeforeDiscount = 0
        const sourcesBeforeDiscount = {
          ads: 0,
          affiliate: 0,
          affiliateAds: 0,
          other: 0
        }

        // After discount stats
        let totalIncomeAfterDiscount = 0
        let liveIncomeAfterDiscount = 0
        let ownVideoIncomeAfterDiscount = 0
        let otherVideoIncomeAfterDiscount = 0
        const sourcesAfterDiscount = {
          ads: 0,
          affiliate: 0,
          affiliateAds: 0,
          other: 0
        }

        // Discount stats
        let totalPlatformDiscount = 0
        let totalSellerDiscount = 0
        let totalOriginalPrice = 0
        let orderCount = incomes.reduce(
          (sum, income) => sum + (income.products ? income.products.length : 0),
          0
        )

        // Products quantity tracking
        const productsQuantityMap: Record<string, number> = {}

        for (const income of incomes) {
          const provider = income.shippingProvider || "(unknown)"
          shipMap[provider] = (shipMap[provider] || 0) + 1

          for (const p of income.products || []) {
            const priceBeforeDiscount = p.price || 0
            const platformDiscount = p.platformDiscount || 0
            const sellerDiscount = p.sellerDiscount || 0
            // CHỈ TRỪ DISCOUNT CỦA SELLER, KHÔNG TRỪ DISCOUNT CỦA PLATFORM
            const priceAfterSellerDiscount =
              priceBeforeDiscount - sellerDiscount

            // Calculate before discount
            totalIncomeBeforeDiscount += priceBeforeDiscount
            totalPlatformDiscount += platformDiscount
            totalSellerDiscount += sellerDiscount
            totalOriginalPrice += priceBeforeDiscount

            if (p.source === "ads")
              sourcesBeforeDiscount.ads += priceBeforeDiscount
            else if (p.source === "affiliate")
              sourcesBeforeDiscount.affiliate += priceBeforeDiscount
            else if (p.source === "affiliate-ads")
              sourcesBeforeDiscount.affiliateAds += priceBeforeDiscount
            else sourcesBeforeDiscount.other += priceBeforeDiscount

            // Calculate after discount (CHỈ TRỪ SELLER DISCOUNT)
            totalIncomeAfterDiscount += priceAfterSellerDiscount

            if (p.source === "ads")
              sourcesAfterDiscount.ads += priceAfterSellerDiscount
            else if (p.source === "affiliate")
              sourcesAfterDiscount.affiliate += priceAfterSellerDiscount
            else if (p.source === "affiliate-ads")
              sourcesAfterDiscount.affiliateAds += priceAfterSellerDiscount
            else sourcesAfterDiscount.other += priceAfterSellerDiscount

            // Calculate live/video by content (both before and after discount)
            if (typeof p.content === "string") {
              if (/Phát trực tiếp|livestream/i.test(p.content)) {
                liveIncomeBeforeDiscount += priceBeforeDiscount
                liveIncomeAfterDiscount += priceAfterSellerDiscount
              } else if (/video/i.test(p.content)) {
                const creator = p.creator
                if (creator && OWN_USERS.includes(String(creator))) {
                  ownVideoIncomeBeforeDiscount += priceBeforeDiscount
                  ownVideoIncomeAfterDiscount += priceAfterSellerDiscount
                } else {
                  otherVideoIncomeBeforeDiscount += priceBeforeDiscount
                  otherVideoIncomeAfterDiscount += priceAfterSellerDiscount
                }
              }
            }

            if (p.box) boxMap[p.box] = (boxMap[p.box] || 0) + (p.quantity || 0)

            // Track products quantity
            const productCode = p.code || "(unknown)"
            productsQuantityMap[productCode] =
              (productsQuantityMap[productCode] || 0) + (p.quantity || 0)
          }
        }

        const videoIncomeBeforeDiscount =
          ownVideoIncomeBeforeDiscount + otherVideoIncomeBeforeDiscount
        const otherIncomeBeforeDiscount =
          totalIncomeBeforeDiscount -
          videoIncomeBeforeDiscount -
          liveIncomeBeforeDiscount

        const videoIncomeAfterDiscount =
          ownVideoIncomeAfterDiscount + otherVideoIncomeAfterDiscount
        const otherIncomeAfterDiscount =
          totalIncomeAfterDiscount -
          videoIncomeAfterDiscount -
          liveIncomeAfterDiscount

        const boxes = Object.entries(boxMap)
          .map(([box, quantity]) => ({ box, quantity }))
          .sort((a, b) => a.box.localeCompare(b.box))
        const shippingProviders = Object.entries(shipMap)
          .map(([provider, orders]) => ({ provider, orders }))
          .sort((a, b) => b.orders - a.orders)

        // Build ads filter with channel if provided
        const adsFilter: any = { date: { $gte: s, $lte: e } }
        if (channelId) {
          adsFilter.channel = new Types.ObjectId(channelId)
        }

        const adsAgg = await this.dailyAdsModel
          .aggregate([
            { $match: adsFilter },
            {
              $group: {
                _id: null,
                liveAdsCost: { $sum: { $ifNull: ["$liveAdsCost", 0] } },
                shopAdsCost: { $sum: { $ifNull: ["$shopAdsCost", 0] } }
              }
            }
          ])
          .exec()
        const liveAdsCost = adsAgg?.[0]?.liveAdsCost || 0
        const shopAdsCost = adsAgg?.[0]?.shopAdsCost || 0
        const percentages = {
          liveAdsToLiveIncome:
            liveIncomeAfterDiscount === 0
              ? 0
              : Math.round((liveAdsCost / liveIncomeAfterDiscount) * 10000) /
                100,
          shopAdsToShopIncome:
            videoIncomeAfterDiscount === 0
              ? 0
              : Math.round((shopAdsCost / videoIncomeAfterDiscount) * 10000) /
                100
        }

        const totalDiscount = totalPlatformDiscount + totalSellerDiscount
        const avgDiscountPerOrder =
          orderCount > 0 ? totalSellerDiscount / orderCount : 0
        const discountPercentage =
          totalOriginalPrice > 0
            ? (totalSellerDiscount / totalOriginalPrice) * 100
            : 0

        // Sort products by quantity descending
        const productsQuantity = Object.fromEntries(
          Object.entries(productsQuantityMap).sort(([, a], [, b]) => b - a)
        )

        return {
          beforeDiscount: {
            totalIncome: totalIncomeBeforeDiscount,
            liveIncome: liveIncomeBeforeDiscount,
            videoIncome: videoIncomeBeforeDiscount,
            ownVideoIncome: ownVideoIncomeBeforeDiscount,
            otherVideoIncome: otherVideoIncomeBeforeDiscount,
            otherIncome: otherIncomeBeforeDiscount,
            sources: sourcesBeforeDiscount
          },
          afterDiscount: {
            totalIncome: totalIncomeAfterDiscount,
            liveIncome: liveIncomeAfterDiscount,
            videoIncome: videoIncomeAfterDiscount,
            ownVideoIncome: ownVideoIncomeAfterDiscount,
            otherVideoIncome: otherVideoIncomeAfterDiscount,
            otherIncome: otherIncomeAfterDiscount,
            sources: sourcesAfterDiscount
          },
          boxes,
          shippingProviders,
          ads: { liveAdsCost, shopAdsCost, percentages },
          discounts: {
            totalPlatformDiscount,
            totalSellerDiscount,
            totalDiscount,
            avgDiscountPerOrder,
            discountPercentage: Math.round(discountPercentage * 100) / 100
          },
          productsQuantity
        }
      }

      const current = await buildStats(start, end)
      if (!comparePrevious)
        return { period: { startDate: start, endDate: end, days }, current }

      const prevEnd = new Date(start.getTime() - 1)
      const prevStart = new Date(prevEnd.getTime() - (days - 1) * 86400000)
      const previous = await buildStats(prevStart, prevEnd)
      const pct = (cur: number, prev: number) =>
        prev === 0
          ? cur === 0
            ? 0
            : 100
          : Math.round(((cur - prev) / prev) * 10000) / 100

      const changes = {
        beforeDiscount: {
          totalIncomePct: pct(
            current.beforeDiscount.totalIncome,
            previous.beforeDiscount.totalIncome
          ),
          liveIncomePct: pct(
            current.beforeDiscount.liveIncome,
            previous.beforeDiscount.liveIncome
          ),
          videoIncomePct: pct(
            current.beforeDiscount.videoIncome,
            previous.beforeDiscount.videoIncome
          ),
          ownVideoIncomePct: pct(
            current.beforeDiscount.ownVideoIncome,
            previous.beforeDiscount.ownVideoIncome
          ),
          otherVideoIncomePct: pct(
            current.beforeDiscount.otherVideoIncome,
            previous.beforeDiscount.otherVideoIncome
          ),
          sources: {
            adsPct: pct(
              current.beforeDiscount.sources.ads,
              previous.beforeDiscount.sources.ads
            ),
            affiliatePct: pct(
              current.beforeDiscount.sources.affiliate,
              previous.beforeDiscount.sources.affiliate
            ),
            affiliateAdsPct: pct(
              current.beforeDiscount.sources.affiliateAds,
              previous.beforeDiscount.sources.affiliateAds
            ),
            otherPct: pct(
              current.beforeDiscount.sources.other,
              previous.beforeDiscount.sources.other
            )
          }
        },
        afterDiscount: {
          totalIncomePct: pct(
            current.afterDiscount.totalIncome,
            previous.afterDiscount.totalIncome
          ),
          liveIncomePct: pct(
            current.afterDiscount.liveIncome,
            previous.afterDiscount.liveIncome
          ),
          videoIncomePct: pct(
            current.afterDiscount.videoIncome,
            previous.afterDiscount.videoIncome
          ),
          ownVideoIncomePct: pct(
            current.afterDiscount.ownVideoIncome,
            previous.afterDiscount.ownVideoIncome
          ),
          otherVideoIncomePct: pct(
            current.afterDiscount.otherVideoIncome,
            previous.afterDiscount.otherVideoIncome
          ),
          sources: {
            adsPct: pct(
              current.afterDiscount.sources.ads,
              previous.afterDiscount.sources.ads
            ),
            affiliatePct: pct(
              current.afterDiscount.sources.affiliate,
              previous.afterDiscount.sources.affiliate
            ),
            affiliateAdsPct: pct(
              current.afterDiscount.sources.affiliateAds,
              previous.afterDiscount.sources.affiliateAds
            ),
            otherPct: pct(
              current.afterDiscount.sources.other,
              previous.afterDiscount.sources.other
            )
          }
        },
        ads: {
          liveAdsCostPct: pct(
            current.ads.liveAdsCost,
            previous.ads.liveAdsCost
          ),
          shopAdsCostPct: pct(
            current.ads.shopAdsCost,
            previous.ads.shopAdsCost
          ),
          liveAdsToLiveIncomePctDiff:
            Math.round(
              (current.ads.percentages.liveAdsToLiveIncome -
                previous.ads.percentages.liveAdsToLiveIncome) *
                100
            ) / 100,
          shopAdsToShopIncomePctDiff:
            Math.round(
              (current.ads.percentages.shopAdsToShopIncome -
                previous.ads.percentages.shopAdsToShopIncome) *
                100
            ) / 100
        },
        discounts: {
          totalPlatformDiscountPct: pct(
            current.discounts.totalPlatformDiscount,
            previous.discounts.totalPlatformDiscount
          ),
          totalSellerDiscountPct: pct(
            current.discounts.totalSellerDiscount,
            previous.discounts.totalSellerDiscount
          ),
          totalDiscountPct: pct(
            current.discounts.totalDiscount,
            previous.discounts.totalDiscount
          ),
          avgDiscountPerOrderPct: pct(
            current.discounts.avgDiscountPerOrder,
            previous.discounts.avgDiscountPerOrder
          ),
          discountPercentageDiff:
            Math.round(
              (current.discounts.discountPercentage -
                previous.discounts.discountPercentage) *
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
    channel: string
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

      // Xóa incomes trong ngày nhưng chỉ cho channel này
      await this.incomeModel.deleteMany({
        date: { $gte: start, $lte: end },
        channel: dto.channel
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
          platformDiscount: line["SKU Platform Discount"] || 0,
          sellerDiscount: line["SKU Seller Discount"] || 0,
          priceAfterDiscount: line["SKU Subtotal After Discount"] || 0,
          sourceChecked: false
        }))
        inserts.push({
          orderId,
          customer: lines[0]["Buyer Username"] || "user",
          province: lines[0]["Province"] || "",
          shippingProvider,
          channel: dto.channel,
          date: dto.date,
          products
        })
      }
      if (inserts.length) {
        await this.incomeModel.insertMany(inserts, {
          ordered: false
        })
      }

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

      affiliateData.forEach(async (line) => {
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

            const affiliateAdsPercentage = Number(
              line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
            )
            foundProduct.affiliateAdsPercentage = isNaN(affiliateAdsPercentage)
              ? 0
              : affiliateAdsPercentage

            const affiliateAdsAmount = Number(
              line["Thanh toán hoa hồng Quảng cáo cửa hàng ước tính"]
            )
            foundProduct.affiliateAdsAmount = isNaN(affiliateAdsAmount)
              ? 0
              : affiliateAdsAmount

            const standardAffPercentage = Number(
              line["Tỷ lệ hoa hồng tiêu chuẩn"]
            )
            foundProduct.standardAffPercentage = isNaN(standardAffPercentage)
              ? 0
              : standardAffPercentage

            const standardAffAmount = Number(
              line["Thanh toán hoa hồng tiêu chuẩn ước tính"]
            )
            foundProduct.standardAffAmount = isNaN(standardAffAmount)
              ? 0
              : standardAffAmount

            await existedOrder.save()
          }
        }
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xử lý file tổng doanh thu và affiliate",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getDetailedProductStats(
    startDate: Date,
    endDate: Date,
    page = 1,
    limit = 20
  ): Promise<{
    products: Array<{
      code: string
      name: string
      totalQuantity: number
      totalOriginalPrice: number
      totalPlatformDiscount: number
      totalSellerDiscount: number
      totalPriceAfterDiscount: number
      avgDiscountPercentage: number
      orderCount: number
    }>
    total: number
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const pipeline = [
        { $match: { date: { $gte: start, $lte: end } } },
        { $unwind: "$products" },
        {
          $group: {
            _id: {
              code: "$products.code",
              name: "$products.name"
            },
            totalQuantity: { $sum: "$products.quantity" },
            totalOriginalPrice: { $sum: { $ifNull: ["$products.price", 0] } },
            totalPlatformDiscount: {
              $sum: { $ifNull: ["$products.platformDiscount", 0] }
            },
            totalSellerDiscount: {
              $sum: { $ifNull: ["$products.sellerDiscount", 0] }
            },
            totalPriceAfterDiscount: {
              $sum: {
                $ifNull: ["$products.priceAfterDiscount", "$products.price"]
              }
            },
            orderCount: { $sum: 1 }
          }
        },
        {
          $addFields: {
            avgDiscountPercentage: {
              $cond: {
                if: { $gt: ["$totalOriginalPrice", 0] },
                then: {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $add: [
                            "$totalPlatformDiscount",
                            "$totalSellerDiscount"
                          ]
                        },
                        "$totalOriginalPrice"
                      ]
                    },
                    100
                  ]
                },
                else: 0
              }
            }
          }
        },
        { $sort: { totalOriginalPrice: -1 } }
      ]

      const [results, totalCount] = await Promise.all([
        this.incomeModel.aggregate([
          ...pipeline,
          { $skip: (page - 1) * limit },
          { $limit: limit }
        ] as any),
        this.incomeModel.aggregate([...pipeline, { $count: "total" }] as any)
      ])

      const products = results.map((item) => ({
        code: item._id.code,
        name: item._id.name,
        totalQuantity: item.totalQuantity,
        totalOriginalPrice: item.totalOriginalPrice,
        totalPlatformDiscount: item.totalPlatformDiscount,
        totalSellerDiscount: item.totalSellerDiscount,
        totalPriceAfterDiscount: item.totalPriceAfterDiscount,
        avgDiscountPercentage:
          Math.round(item.avgDiscountPercentage * 100) / 100,
        orderCount: item.orderCount
      }))

      return {
        products,
        total: totalCount[0]?.total || 0
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy thống kê chi tiết sản phẩm",
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

  private sumProductsAmountBeforeDiscount(products: any[]) {
    return products.reduce((sum, p) => sum + (p.price || 0), 0)
  }

  private sumProductsAmountAfterSellerDiscount(products: any[]) {
    return products.reduce((sum, p) => {
      const priceBeforeDiscount = p.price || 0
      const sellerDiscount = p.sellerDiscount || 0
      return sum + (priceBeforeDiscount - sellerDiscount)
    }, 0)
  }

  private sumProductsQuantity(products: any[]) {
    return products.reduce((sum, p) => sum + (p.quantity || 0), 0)
  }

  private getActualPrice(product: any): number {
    // CẢNH BÁO: Hàm này trừ CẢ PLATFORM + SELLER DISCOUNT
    // Không dùng cho business logic chỉ trừ seller discount
    return product.priceAfterDiscount || product.price || 0
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
