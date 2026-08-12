import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns"
import { fromZonedTime, toZonedTime } from "date-fns-tz"
import { Model } from "mongoose"
import { SalesDailyAds } from "../database/mongoose/schemas/SalesDailyAds"
import { SalesDailyReport } from "../database/mongoose/schemas/SalesDailyReport"

const SALES_DAILY_ADS_TIME_ZONE = "Asia/Ho_Chi_Minh"

@Injectable()
export class SalesDailyAdsService {
  constructor(
    @InjectModel("salesdailyads")
    private readonly salesDailyAdsModel: Model<SalesDailyAds>,
    @InjectModel("salesdailyreports")
    private readonly salesDailyReportModel: Model<SalesDailyReport>
  ) {}

  private getUtcDayStart(date: Date): Date {
    const zonedDate = toZonedTime(date, SALES_DAILY_ADS_TIME_ZONE)
    return fromZonedTime(startOfDay(zonedDate), SALES_DAILY_ADS_TIME_ZONE)
  }

  async upsertAdsCost(payload: {
    date: Date
    adsCost: number
    newLeads: number
  }): Promise<SalesDailyAds> {
    if (Number.isNaN(payload.date.getTime())) {
      throw new HttpException("Ngày không hợp lệ", HttpStatus.BAD_REQUEST)
    }

    const adsCost = Number(payload.adsCost)

    if (!Number.isFinite(adsCost) || adsCost < 0) {
      throw new HttpException(
        "Chi phí quảng cáo phải là số không âm",
        HttpStatus.BAD_REQUEST
      )
    }

    const newLeads = Number(payload.newLeads)

    if (!Number.isFinite(newLeads) || newLeads < 0) {
      throw new HttpException(
        "Số lead mới phải là số không âm",
        HttpStatus.BAD_REQUEST
      )
    }

    const date = this.getUtcDayStart(payload.date)
    const now = new Date()

    return this.salesDailyAdsModel.findOneAndUpdate(
      { date },
      {
        $set: {
          adsCost,
          newLeads,
          updatedAt: now
        },
        $setOnInsert: {
          date,
          createdAt: now
        }
      },
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    )
  }

  async getAdsByMonth(
    month: number,
    year: number
  ): Promise<{
    data: Array<Pick<SalesDailyAds, "date" | "adsCost" | "newLeads">>
    total: number
  }> {
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year)
    ) {
      throw new HttpException(
        "Tháng hoặc năm không hợp lệ",
        HttpStatus.BAD_REQUEST
      )
    }

    const zonedMonth = new Date(year, month - 1, 1)

    const start = fromZonedTime(
      startOfMonth(zonedMonth),
      SALES_DAILY_ADS_TIME_ZONE
    )

    const end = fromZonedTime(
      endOfDay(endOfMonth(zonedMonth)),
      SALES_DAILY_ADS_TIME_ZONE
    )

    const filter = {
      date: {
        $gte: start,
        $lte: end
      }
    }

    const [newAds, legacyAds] = await Promise.all([
      this.salesDailyAdsModel
        .find(filter)
        .select("date adsCost newLeads")
        .lean(),

      this.salesDailyReportModel.aggregate<{
        _id: Date
        adsCost: number
      }>([
        {
          $match: {
            ...filter,
            deletedAt: null
          }
        },
        {
          $group: {
            _id: "$date",
            adsCost: {
              $sum: "$adsCost"
            }
          }
        }
      ])
    ])

    const adsByDate = new Map<
      number,
      {
        adsCost: number
        newLeads: number
      }
    >()

    for (const legacyAd of legacyAds) {
      adsByDate.set(new Date(legacyAd._id).getTime(), {
        adsCost: Number(legacyAd.adsCost || 0),
        newLeads: 0
      })
    }

    for (const newAd of newAds) {
      adsByDate.set(new Date(newAd.date).getTime(), {
        adsCost: Number(newAd.adsCost || 0),
        newLeads: Number(newAd.newLeads || 0)
      })
    }

    const data = Array.from(adsByDate, ([time, value]) => ({
      date: new Date(time),
      adsCost: value.adsCost,
      newLeads: value.newLeads
    })).sort((a, b) => a.date.getTime() - b.date.getTime())

    return {
      data,
      total: data.length
    }
  }
}