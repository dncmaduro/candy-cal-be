import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import * as XLSX from "xlsx"
import { CurrencyExchangeService } from "../common/currency-exchange.service"

@Injectable()
export class DailyAdsService {
  constructor(
    @InjectModel("dailyads")
    private readonly dailyAdsModel: Model<DailyAds>,
    private readonly currencyExchangeService: CurrencyExchangeService
  ) {}

  async createOrUpdateDailyAds(
    yesterdayLiveAdsCostFileBefore4pm: Express.Multer.File,
    yesterdayShopAdsCostFileBefore4pm: Express.Multer.File,
    yesterdayLiveAdsCostFile: Express.Multer.File,
    yesterdayShopAdsCostFile: Express.Multer.File,
    todayLiveAdsCostFileBefore4pm: Express.Multer.File,
    todayShopAdsCostFileBefore4pm: Express.Multer.File,
    date: Date,
    currency: "vnd" | "usd" = "vnd"
  ): Promise<void> {
    try {
      const parseCost = (file?: Express.Multer.File): number => {
        if (!file || !file.buffer) return 0
        try {
          const wb = XLSX.read(file.buffer, { type: "buffer" })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws)
          let sum = 0
          for (const r of rows) {
            const key = Object.keys(r).find(
              (k) => k && k.toLowerCase().trim() === "cost"
            )
            // fallback: any key that contains 'cost'
            const keyFallback =
              !key &&
              Object.keys(r).find((k) => k && k.toLowerCase().includes("cost"))

            const costKey = key || keyFallback
            if (!costKey) continue
            const v = Number(r[costKey])
            if (!isNaN(v) && isFinite(v)) sum += v
          }
          for (const r of rows) {
            const key = Object.keys(r).find(
              (k) => k && k.toLowerCase().trim() === "chi phí"
            )
            // fallback: any key that contains 'chi phí'
            const keyFallback =
              !key &&
              Object.keys(r).find(
                (k) => k && k.toLowerCase().includes("chi phí")
              )

            const costKey = key || keyFallback
            if (!costKey) continue
            const v = Number(r[costKey])
            if (!isNaN(v) && isFinite(v)) sum += v
          }
          return sum
        } catch (e) {
          console.error("Error parsing XLSX for cost:", e)
          return 0
        }
      }

      let yLiveBefore4 = parseCost(yesterdayLiveAdsCostFileBefore4pm)
      let yShopBefore4 = parseCost(yesterdayShopAdsCostFileBefore4pm)
      let yLiveFull = parseCost(yesterdayLiveAdsCostFile)
      let yShopFull = parseCost(yesterdayShopAdsCostFile)
      let tLiveBefore4 = parseCost(todayLiveAdsCostFileBefore4pm)
      let tShopBefore4 = parseCost(todayShopAdsCostFileBefore4pm)

      // Convert from USD to VND if needed
      if (currency === "usd") {
        const rate = await this.currencyExchangeService.getUsdToVndRate()
        yLiveBefore4 = Math.round(yLiveBefore4 * rate)
        yShopBefore4 = Math.round(yShopBefore4 * rate)
        yLiveFull = Math.round(yLiveFull * rate)
        yShopFull = Math.round(yShopFull * rate)
        tLiveBefore4 = Math.round(tLiveBefore4 * rate)
        tShopBefore4 = Math.round(tShopBefore4 * rate)
      }

      const liveAdsCost = yLiveFull - yLiveBefore4 + tLiveBefore4
      const shopAdsCost = yShopFull - yShopBefore4 + tShopBefore4

      const target = new Date(date)
      target.setHours(0, 0, 0, 0)

      await this.dailyAdsModel.findOneAndUpdate(
        { date: target },
        {
          $set: {
            liveAdsCost: liveAdsCost || 0,
            shopAdsCost: shopAdsCost || 0,
            before4pmLiveAdsCost: tLiveBefore4 || 0,
            before4pmShopAdsCost: tShopBefore4 || 0,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      )
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo/cập nhật quảng cáo ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Update daily ads using 4 files (yesterday full + today before-4pm).
   * Requires yesterday's before-4pm costs to be already saved in DB.
   */
  async updateDailyAdsUsingSavedBefore4pm(
    yesterdayLiveAdsCostFile: Express.Multer.File,
    yesterdayShopAdsCostFile: Express.Multer.File,
    todayLiveAdsCostFileBefore4pm: Express.Multer.File,
    todayShopAdsCostFileBefore4pm: Express.Multer.File,
    date: Date,
    currency: "vnd" | "usd" = "vnd"
  ): Promise<void> {
    try {
      const parseCost = (file?: Express.Multer.File): number => {
        if (!file || !file.buffer) return 0
        try {
          const wb = XLSX.read(file.buffer, { type: "buffer" })
          const ws = wb.Sheets[wb.SheetNames[0]]
          const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws)
          let sum = 0
          for (const r of rows) {
            const key = Object.keys(r).find(
              (k) => k && k.toLowerCase().trim() === "cost"
            )
            // fallback: any key that contains 'cost'
            const keyFallback =
              !key &&
              Object.keys(r).find((k) => k && k.toLowerCase().includes("cost"))

            const costKey = key || keyFallback
            if (!costKey) continue
            const v = Number(r[costKey])
            if (!isNaN(v) && isFinite(v)) sum += v
          }
          for (const r of rows) {
            const key = Object.keys(r).find(
              (k) => k && k.toLowerCase().trim() === "chi phí"
            )
            // fallback: any key that contains 'chi phí'
            const keyFallback =
              !key &&
              Object.keys(r).find(
                (k) => k && k.toLowerCase().includes("chi phí")
              )

            const costKey = key || keyFallback
            if (!costKey) continue
            const v = Number(r[costKey])
            if (!isNaN(v) && isFinite(v)) sum += v
          }
          return sum
        } catch (e) {
          console.error("Error parsing XLSX for cost:", e)
          return 0
        }
      }

      const target = new Date(date)
      target.setHours(0, 0, 0, 0)

      // Get yesterday's date
      const yesterday = new Date(target)
      yesterday.setDate(yesterday.getDate() - 1)

      // Get yesterday's before-4pm costs from DB
      const yesterdayRecord = await this.dailyAdsModel
        .findOne({ date: yesterday })
        .exec()

      if (!yesterdayRecord) {
        throw new HttpException(
          "Không tìm thấy chi phí trước 16h của ngày hôm qua. Vui lòng tạo trước.",
          HttpStatus.BAD_REQUEST
        )
      }

      const yLiveBefore4 = yesterdayRecord.before4pmLiveAdsCost || 0
      const yShopBefore4 = yesterdayRecord.before4pmShopAdsCost || 0

      if (yLiveBefore4 === 0 && yShopBefore4 === 0) {
        throw new HttpException(
          "Chi phí trước 16h của ngày hôm qua chưa được lưu hoặc bằng 0",
          HttpStatus.BAD_REQUEST
        )
      }

      let yLiveFull = parseCost(yesterdayLiveAdsCostFile)
      let yShopFull = parseCost(yesterdayShopAdsCostFile)
      let tLiveBefore4 = parseCost(todayLiveAdsCostFileBefore4pm)
      let tShopBefore4 = parseCost(todayShopAdsCostFileBefore4pm)

      // Convert from USD to VND if needed
      if (currency === "usd") {
        const rate = await this.currencyExchangeService.getUsdToVndRate()
        yLiveFull = Math.round(yLiveFull * rate)
        yShopFull = Math.round(yShopFull * rate)
        tLiveBefore4 = Math.round(tLiveBefore4 * rate)
        tShopBefore4 = Math.round(tShopBefore4 * rate)
      }

      const liveAdsCost = yLiveFull - yLiveBefore4 + tLiveBefore4
      const shopAdsCost = yShopFull - yShopBefore4 + tShopBefore4

      await this.dailyAdsModel.findOneAndUpdate(
        { date: target },
        {
          $set: {
            liveAdsCost: liveAdsCost || 0,
            shopAdsCost: shopAdsCost || 0,
            before4pmLiveAdsCost: tLiveBefore4 || 0,
            before4pmShopAdsCost: tShopBefore4 || 0,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      )
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật quảng cáo ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Get before-4pm ads costs for a specific date
   */
  async getBefore4pmCosts(date: Date): Promise<{
    date: Date
    before4pmLiveAdsCost: number
    before4pmShopAdsCost: number
    totalBefore4pmCost: number
  } | null> {
    try {
      const target = new Date(date)
      target.setHours(0, 0, 0, 0)

      const record = await this.dailyAdsModel.findOne({ date: target }).exec()

      if (!record) {
        return null
      }

      return {
        date: record.date,
        before4pmLiveAdsCost: record.before4pmLiveAdsCost || 0,
        before4pmShopAdsCost: record.before4pmShopAdsCost || 0,
        totalBefore4pmCost:
          (record.before4pmLiveAdsCost || 0) +
          (record.before4pmShopAdsCost || 0)
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy chi phí trước 16h",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Simple create/update daily ads without file upload
   * Just provide date, liveAdsCost, shopAdsCost and currency
   */
  async simpleCreateOrUpdateDailyAds(
    date: Date,
    liveAdsCost: number,
    shopAdsCost: number,
    currency: "vnd" | "usd" = "vnd",
    channelId?: string
  ): Promise<DailyAds> {
    try {
      let finalLiveAdsCost = liveAdsCost
      let finalShopAdsCost = shopAdsCost

      // Convert from USD to VND if needed
      if (currency === "usd") {
        const rate = await this.currencyExchangeService.getUsdToVndRate()
        finalLiveAdsCost = Math.round(liveAdsCost * rate)
        finalShopAdsCost = Math.round(shopAdsCost * rate)
      }

      const target = new Date(date)
      target.setHours(0, 0, 0, 0)

      // Build query filter - use both date and channel for unique identification
      const queryFilter: any = { date: target }
      if (channelId) {
        queryFilter.channel = new Types.ObjectId(channelId)
      }

      // Build update object
      const updateData: any = {
        liveAdsCost: finalLiveAdsCost || 0,
        shopAdsCost: finalShopAdsCost || 0,
        updatedAt: new Date()
      }

      // Add channel if provided (for upsert case)
      if (channelId) {
        updateData.channel = new Types.ObjectId(channelId)
      }

      const result = await this.dailyAdsModel.findOneAndUpdate(
        queryFilter,
        {
          $set: updateData
        },
        { upsert: true, new: true }
      )

      return result
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo/cập nhật quảng cáo ngày (simple)",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
