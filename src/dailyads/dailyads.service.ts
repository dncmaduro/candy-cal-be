import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import { DailyAdsDto } from "./dto/dailyads.dto"
import * as XLSX from "xlsx"

@Injectable()
export class DailyAdsService {
  constructor(
    @InjectModel("dailyads")
    private readonly dailyAdsModel: Model<DailyAds>
  ) {}

  async createOrUpdateDailyAds(
    yesterdayLiveAdsCostFileBefore4pm: Express.Multer.File,
    yesterdayShopAdsCostFileBefore4pm: Express.Multer.File,
    yesterdayLiveAdsCostFile: Express.Multer.File,
    yesterdayShopAdsCostFile: Express.Multer.File,
    todayLiveAdsCostFileBefore4pm: Express.Multer.File,
    todayShopAdsCostFileBefore4pm: Express.Multer.File,
    date: Date
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
            // fallback: any key that contains 'cost'
            const keyFallback =
              !key &&
              Object.keys(r).find((k) => k && k.toLowerCase().includes("cost"))

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

      const yLiveBefore4 = parseCost(yesterdayLiveAdsCostFileBefore4pm)
      const yShopBefore4 = parseCost(yesterdayShopAdsCostFileBefore4pm)
      const yLiveFull = parseCost(yesterdayLiveAdsCostFile)
      const yShopFull = parseCost(yesterdayShopAdsCostFile)
      const tLiveBefore4 = parseCost(todayLiveAdsCostFileBefore4pm)
      const tShopBefore4 = parseCost(todayShopAdsCostFileBefore4pm)

      const liveAdsCost = yLiveFull - yLiveBefore4 + tLiveBefore4
      const shopAdsCost = yShopFull - yShopBefore4 + tShopBefore4
      console.log({
        yLiveBefore4,
        yShopBefore4,
        yLiveFull,
        yShopFull,
        tLiveBefore4,
        tShopBefore4,
        liveAdsCost,
        shopAdsCost
      })

      const target = new Date(date)
      target.setHours(0, 0, 0, 0)

      await this.dailyAdsModel.findOneAndUpdate(
        { date: target },
        {
          $set: {
            liveAdsCost: liveAdsCost || 0,
            shopAdsCost: shopAdsCost || 0,
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
}
