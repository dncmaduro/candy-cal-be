import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import { DailyAdsV2 } from "../database/mongoose/schemas/DailyAdsV2"
import * as XLSX from "xlsx"
import { CurrencyExchangeService } from "../common/currency-exchange.service"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

const DAILY_ADS_TIME_ZONE = "Asia/Ho_Chi_Minh"
const DAILY_ADS_V2_CUTOFF = fromZonedTime(
  "2026-04-01T00:00:00",
  DAILY_ADS_TIME_ZONE
)

export type DailyAdsStorageMode = "legacy" | "v2" | "mixed"

@Injectable()
export class DailyAdsService {
  constructor(
    @InjectModel("dailyads")
    private readonly dailyAdsModel: Model<DailyAds>,
    @InjectModel("dailyadsv2")
    private readonly dailyAdsV2Model: Model<DailyAdsV2>,
    private readonly currencyExchangeService: CurrencyExchangeService
  ) {}

  private normalizeDateToBusinessDay(date: Date): Date {
    const localDate = formatInTimeZone(date, DAILY_ADS_TIME_ZONE, "yyyy-MM-dd")
    return fromZonedTime(`${localDate}T00:00:00`, DAILY_ADS_TIME_ZONE)
  }

  private parseCost(file?: Express.Multer.File): number {
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
        const keyFallback =
          !key &&
          Object.keys(r).find((k) => k && k.toLowerCase().includes("chi phí"))

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

  private async convertCosts(
    costs: number[],
    currency: "vnd" | "usd"
  ): Promise<number[]> {
    if (currency !== "usd") return costs

    const rate = await this.currencyExchangeService.getUsdToVndRate()
    return costs.map((value) => Math.round(value * rate))
  }

  private buildAdsFilter(start: Date, end: Date, channelId?: string) {
    const filter: any = { date: { $gte: start, $lte: end } }
    if (channelId) {
      filter.channel = new Types.ObjectId(channelId)
    }
    return filter
  }

  async getAdsCostsByDateRange(
    startDate: Date,
    endDate: Date,
    channelId?: string
  ): Promise<{
    mode: DailyAdsStorageMode
    liveAdsCost: number
    shopAdsCost: number
    internalAdsCost: number
    externalAdsCost: number
  }> {
    const start = new Date(startDate)
    const end = new Date(endDate)
    const usesLegacy = start < DAILY_ADS_V2_CUTOFF
    const usesV2 = end >= DAILY_ADS_V2_CUTOFF

    let legacyLiveAdsCost = 0
    let legacyShopAdsCost = 0
    let v2InternalAdsCost = 0
    let v2ExternalAdsCost = 0

    if (usesLegacy) {
      const legacyEnd =
        end < DAILY_ADS_V2_CUTOFF
          ? end
          : new Date(DAILY_ADS_V2_CUTOFF.getTime() - 1)
      const rows = await this.dailyAdsModel
        .aggregate([
          {
            $match: this.buildAdsFilter(start, legacyEnd, channelId)
          },
          {
            $group: {
              _id: null,
              liveAdsCost: { $sum: { $ifNull: ["$liveAdsCost", 0] } },
              shopAdsCost: { $sum: { $ifNull: ["$shopAdsCost", 0] } }
            }
          }
        ])
        .exec()
      legacyLiveAdsCost = rows?.[0]?.liveAdsCost || 0
      legacyShopAdsCost = rows?.[0]?.shopAdsCost || 0
    }

    if (usesV2) {
      const v2Start = start >= DAILY_ADS_V2_CUTOFF ? start : DAILY_ADS_V2_CUTOFF
      const rows = await this.dailyAdsV2Model
        .aggregate([
          {
            $match: this.buildAdsFilter(v2Start, end, channelId)
          },
          {
            $group: {
              _id: null,
              internalAdsCost: { $sum: { $ifNull: ["$internalAdsCost", 0] } },
              externalAdsCost: { $sum: { $ifNull: ["$externalAdsCost", 0] } }
            }
          }
        ])
        .exec()
      v2InternalAdsCost = rows?.[0]?.internalAdsCost || 0
      v2ExternalAdsCost = rows?.[0]?.externalAdsCost || 0
    }

    return {
      mode: usesLegacy && usesV2 ? "mixed" : usesV2 ? "v2" : "legacy",
      liveAdsCost: legacyLiveAdsCost + v2InternalAdsCost,
      shopAdsCost: legacyShopAdsCost + v2ExternalAdsCost,
      internalAdsCost: v2InternalAdsCost,
      externalAdsCost: v2ExternalAdsCost
    }
  }

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
      let [
        yLiveBefore4,
        yShopBefore4,
        yLiveFull,
        yShopFull,
        tLiveBefore4,
        tShopBefore4
      ] = await this.convertCosts(
        [
          this.parseCost(yesterdayLiveAdsCostFileBefore4pm),
          this.parseCost(yesterdayShopAdsCostFileBefore4pm),
          this.parseCost(yesterdayLiveAdsCostFile),
          this.parseCost(yesterdayShopAdsCostFile),
          this.parseCost(todayLiveAdsCostFileBefore4pm),
          this.parseCost(todayShopAdsCostFileBefore4pm)
        ],
        currency
      )

      const liveAdsCost = yLiveFull - yLiveBefore4 + tLiveBefore4
      const shopAdsCost = yShopFull - yShopBefore4 + tShopBefore4

      const target = this.normalizeDateToBusinessDay(date)

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
      const target = this.normalizeDateToBusinessDay(date)

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

      let [yLiveFull, yShopFull, tLiveBefore4, tShopBefore4] =
        await this.convertCosts(
          [
            this.parseCost(yesterdayLiveAdsCostFile),
            this.parseCost(yesterdayShopAdsCostFile),
            this.parseCost(todayLiveAdsCostFileBefore4pm),
            this.parseCost(todayShopAdsCostFileBefore4pm)
          ],
          currency
        )

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
      const target = this.normalizeDateToBusinessDay(date)

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
      const [finalLiveAdsCost, finalShopAdsCost] = await this.convertCosts(
        [liveAdsCost, shopAdsCost],
        currency
      )

      const target = this.normalizeDateToBusinessDay(date)

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

  async createOrUpdateDailyAdsV2(
    yesterdayInternalAdsCostFileBefore4pm: Express.Multer.File,
    yesterdayExternalAdsCostFileBefore4pm: Express.Multer.File,
    yesterdayInternalAdsCostFile: Express.Multer.File,
    yesterdayExternalAdsCostFile: Express.Multer.File,
    todayInternalAdsCostFileBefore4pm: Express.Multer.File,
    todayExternalAdsCostFileBefore4pm: Express.Multer.File,
    date: Date,
    currency: "vnd" | "usd" = "vnd"
  ): Promise<void> {
    try {
      let [
        yInternalBefore4,
        yExternalBefore4,
        yInternalFull,
        yExternalFull,
        tInternalBefore4,
        tExternalBefore4
      ] = await this.convertCosts(
        [
          this.parseCost(yesterdayInternalAdsCostFileBefore4pm),
          this.parseCost(yesterdayExternalAdsCostFileBefore4pm),
          this.parseCost(yesterdayInternalAdsCostFile),
          this.parseCost(yesterdayExternalAdsCostFile),
          this.parseCost(todayInternalAdsCostFileBefore4pm),
          this.parseCost(todayExternalAdsCostFileBefore4pm)
        ],
        currency
      )

      const internalAdsCost = yInternalFull - yInternalBefore4 + tInternalBefore4
      const externalAdsCost = yExternalFull - yExternalBefore4 + tExternalBefore4
      const target = this.normalizeDateToBusinessDay(date)

      await this.dailyAdsV2Model.findOneAndUpdate(
        { date: target },
        {
          $set: {
            internalAdsCost: internalAdsCost || 0,
            externalAdsCost: externalAdsCost || 0,
            before4pmInternalAdsCost: tInternalBefore4 || 0,
            before4pmExternalAdsCost: tExternalBefore4 || 0,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      )
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo/cập nhật quảng cáo ngày V2",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateDailyAdsUsingSavedBefore4pmV2(
    yesterdayInternalAdsCostFile: Express.Multer.File,
    yesterdayExternalAdsCostFile: Express.Multer.File,
    todayInternalAdsCostFileBefore4pm: Express.Multer.File,
    todayExternalAdsCostFileBefore4pm: Express.Multer.File,
    date: Date,
    currency: "vnd" | "usd" = "vnd"
  ): Promise<void> {
    try {
      const target = this.normalizeDateToBusinessDay(date)
      const yesterday = new Date(target)
      yesterday.setDate(yesterday.getDate() - 1)

      const yesterdayRecord = await this.dailyAdsV2Model
        .findOne({ date: yesterday })
        .exec()

      if (!yesterdayRecord) {
        throw new HttpException(
          "Không tìm thấy chi phí trước 16h của ngày hôm qua trong DailyAdsV2. Vui lòng tạo trước.",
          HttpStatus.BAD_REQUEST
        )
      }

      const yInternalBefore4 = yesterdayRecord.before4pmInternalAdsCost || 0
      const yExternalBefore4 = yesterdayRecord.before4pmExternalAdsCost || 0

      if (yInternalBefore4 === 0 && yExternalBefore4 === 0) {
        throw new HttpException(
          "Chi phí trước 16h của ngày hôm qua trong DailyAdsV2 chưa được lưu hoặc bằng 0",
          HttpStatus.BAD_REQUEST
        )
      }

      let [
        yInternalFull,
        yExternalFull,
        tInternalBefore4,
        tExternalBefore4
      ] = await this.convertCosts(
        [
          this.parseCost(yesterdayInternalAdsCostFile),
          this.parseCost(yesterdayExternalAdsCostFile),
          this.parseCost(todayInternalAdsCostFileBefore4pm),
          this.parseCost(todayExternalAdsCostFileBefore4pm)
        ],
        currency
      )

      const internalAdsCost = yInternalFull - yInternalBefore4 + tInternalBefore4
      const externalAdsCost = yExternalFull - yExternalBefore4 + tExternalBefore4

      await this.dailyAdsV2Model.findOneAndUpdate(
        { date: target },
        {
          $set: {
            internalAdsCost: internalAdsCost || 0,
            externalAdsCost: externalAdsCost || 0,
            before4pmInternalAdsCost: tInternalBefore4 || 0,
            before4pmExternalAdsCost: tExternalBefore4 || 0,
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      )
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật quảng cáo ngày V2",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getBefore4pmCostsV2(date: Date): Promise<{
    date: Date
    before4pmInternalAdsCost: number
    before4pmExternalAdsCost: number
    totalBefore4pmCost: number
  } | null> {
    try {
      const target = this.normalizeDateToBusinessDay(date)

      const record = await this.dailyAdsV2Model.findOne({ date: target }).exec()
      if (!record) return null

      return {
        date: record.date,
        before4pmInternalAdsCost: record.before4pmInternalAdsCost || 0,
        before4pmExternalAdsCost: record.before4pmExternalAdsCost || 0,
        totalBefore4pmCost:
          (record.before4pmInternalAdsCost || 0) +
          (record.before4pmExternalAdsCost || 0)
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy chi phí trước 16h V2",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async simpleCreateOrUpdateDailyAdsV2(
    date: Date,
    internalAdsCost: number,
    externalAdsCost: number,
    currency: "vnd" | "usd" = "vnd",
    channelId?: string
  ): Promise<DailyAdsV2> {
    try {
      const [finalInternalAdsCost, finalExternalAdsCost] =
        await this.convertCosts([internalAdsCost, externalAdsCost], currency)

      const target = this.normalizeDateToBusinessDay(date)
      const queryFilter: any = { date: target }
      if (channelId) {
        queryFilter.channel = new Types.ObjectId(channelId)
      }

      const updateData: any = {
        internalAdsCost: finalInternalAdsCost || 0,
        externalAdsCost: finalExternalAdsCost || 0,
        updatedAt: new Date()
      }

      if (channelId) {
        updateData.channel = new Types.ObjectId(channelId)
      }

      const result = await this.dailyAdsV2Model.findOneAndUpdate(
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
        "Lỗi khi tạo/cập nhật quảng cáo ngày V2 (simple)",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
