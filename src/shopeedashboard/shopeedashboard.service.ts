import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"
import { ShopeeMonthKpi } from "../database/mongoose/schemas/ShopeeMonthKpi"
import { ShopeeDailyAds } from "../database/mongoose/schemas/ShopeeDailyAds"
import { ShopeeDailyLiveRevenue } from "../database/mongoose/schemas/ShopeeDailyLiveRevenue"
import { ShopeeIncome } from "../database/mongoose/schemas/ShopeeIncome"

const SHOPEE_DASHBOARD_TIME_ZONE = "Asia/Ho_Chi_Minh"

type OverviewScope = "all" | "channel"

type MetricProgress = {
  target: number
  actual: number
  achievedPercentage: number
  expectedPercentage: number
  gapPercentage: number
  paceRatio: number
}

@Injectable()
export class ShopeeDashboardService {
  constructor(
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>,
    @InjectModel("shopeemonthkpis")
    private readonly shopeeMonthKpiModel: Model<ShopeeMonthKpi>,
    @InjectModel("shopeedailyads")
    private readonly shopeeDailyAdsModel: Model<ShopeeDailyAds>,
    @InjectModel("shopeedailyliverevenues")
    private readonly shopeeDailyLiveRevenueModel: Model<ShopeeDailyLiveRevenue>,
    @InjectModel("shopeeincomes")
    private readonly shopeeIncomeModel: Model<ShopeeIncome>
  ) {}

  private validateMonth(month: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new HttpException("Tháng không hợp lệ", HttpStatus.BAD_REQUEST)
    }
  }

  private validateYear(year: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      throw new HttpException("Năm không hợp lệ", HttpStatus.BAD_REQUEST)
    }
  }

  private getMonthRange(month: number, year: number): { start: Date; end: Date } {
    const monthText = String(month).padStart(2, "0")
    const start = fromZonedTime(
      `${year}-${monthText}-01T00:00:00`,
      SHOPEE_DASHBOARD_TIME_ZONE
    )

    const nextMonthYear = month === 12 ? year + 1 : year
    const nextMonth = month === 12 ? 1 : month + 1
    const nextMonthText = String(nextMonth).padStart(2, "0")
    const nextStart = fromZonedTime(
      `${nextMonthYear}-${nextMonthText}-01T00:00:00`,
      SHOPEE_DASHBOARD_TIME_ZONE
    )

    return { start, end: new Date(nextStart.getTime() - 1) }
  }

  private getExpectedProgress(month: number, year: number): {
    expectedPercentage: number
    elapsedDays: number
    totalDays: number
    currentDate: string
  } {
    const now = new Date()
    const currentYear = Number(
      formatInTimeZone(now, SHOPEE_DASHBOARD_TIME_ZONE, "yyyy")
    )
    const currentMonth = Number(
      formatInTimeZone(now, SHOPEE_DASHBOARD_TIME_ZONE, "MM")
    )
    const currentDay = Number(
      formatInTimeZone(now, SHOPEE_DASHBOARD_TIME_ZONE, "dd")
    )
    const currentDate = formatInTimeZone(
      now,
      SHOPEE_DASHBOARD_TIME_ZONE,
      "yyyy-MM-dd"
    )
    const totalDays = new Date(year, month, 0).getDate()

    if (year < currentYear || (year === currentYear && month < currentMonth)) {
      return {
        expectedPercentage: 100,
        elapsedDays: totalDays,
        totalDays,
        currentDate
      }
    }

    if (year > currentYear || (year === currentYear && month > currentMonth)) {
      return {
        expectedPercentage: 0,
        elapsedDays: 0,
        totalDays,
        currentDate
      }
    }

    const expectedPercentage = Number(
      ((currentDay / totalDays) * 100).toFixed(2)
    )

    return {
      expectedPercentage,
      elapsedDays: currentDay,
      totalDays,
      currentDate
    }
  }

  private calculatePercentage(actual: number, target: number): number {
    if (!Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) {
      return 0
    }
    return Number(((actual / target) * 100).toFixed(2))
  }

  private calculatePaceRatio(
    achievedPercentage: number,
    expectedPercentage: number
  ): number {
    if (!Number.isFinite(expectedPercentage) || expectedPercentage <= 0) {
      return 0
    }
    return Number((achievedPercentage / expectedPercentage).toFixed(4))
  }

  private buildMetricProgress(
    target: number,
    actual: number,
    expectedPercentage: number
  ): MetricProgress {
    const achievedPercentage = this.calculatePercentage(actual, target)
    return {
      target,
      actual,
      achievedPercentage,
      expectedPercentage,
      gapPercentage: Number((achievedPercentage - expectedPercentage).toFixed(2)),
      paceRatio: this.calculatePaceRatio(achievedPercentage, expectedPercentage)
    }
  }

  private async resolveScope(channelId?: string): Promise<{
    scope: OverviewScope
    channelIds: Types.ObjectId[]
    selectedChannel: LivestreamChannel | null
  }> {
    if (channelId && channelId !== "all") {
      if (!Types.ObjectId.isValid(channelId)) {
        throw new HttpException("ID kênh không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const channel = await this.livestreamChannelModel.findById(channelId).exec()
      if (!channel) {
        throw new HttpException("Không tìm thấy kênh", HttpStatus.NOT_FOUND)
      }
      if (channel.platform !== "shopee") {
        throw new HttpException(
          "Kênh được chọn không thuộc platform Shopee",
          HttpStatus.BAD_REQUEST
        )
      }

      return {
        scope: "channel",
        channelIds: [channel._id as Types.ObjectId],
        selectedChannel: channel
      }
    }

    const shopeeChannels = await this.livestreamChannelModel
      .find({ platform: "shopee" }, { _id: 1 })
      .exec()

    return {
      scope: "all",
      channelIds: shopeeChannels.map((channel) => channel._id as Types.ObjectId),
      selectedChannel: null
    }
  }

  async getOverview(month: number, year: number, channelId?: string) {
    try {
      this.validateMonth(month)
      this.validateYear(year)

      const { scope, channelIds, selectedChannel } = await this.resolveScope(
        channelId
      )
      const { start, end } = this.getMonthRange(month, year)
      const expected = this.getExpectedProgress(month, year)

      if (channelIds.length === 0) {
        return {
          scope: {
            type: scope,
            month,
            year,
            channelId: null,
            expectedProgressPercentage: expected.expectedPercentage,
            elapsedDays: expected.elapsedDays,
            totalDays: expected.totalDays,
            currentDate: expected.currentDate
          },
          channel: null,
          targets: {
            revenueKpi: 0,
            adsCostKpi: 0,
            roasKpi: 0
          },
          actuals: {
            revenue: 0,
            liveRevenue: 0,
            adsCost: 0,
            roas: 0,
            totalOrders: 0
          },
          progress: {
            revenue: this.buildMetricProgress(0, 0, expected.expectedPercentage),
            adsCost: this.buildMetricProgress(0, 0, expected.expectedPercentage),
            roas: this.buildMetricProgress(0, 0, expected.expectedPercentage)
          }
        }
      }

      const channelFilter =
        channelIds.length === 1 ? channelIds[0] : { $in: channelIds }

      const [kpis, adsAgg, liveRevenueAgg, incomeAgg] = await Promise.all([
        this.shopeeMonthKpiModel
          .find({
            month,
            year,
            channel: channelFilter
          })
          .lean(),
        this.shopeeDailyAdsModel.aggregate([
          { $match: { channel: channelFilter, date: { $gte: start, $lte: end } } },
          { $group: { _id: null, totalAdsCost: { $sum: "$adsCost" } } }
        ]),
        this.shopeeDailyLiveRevenueModel.aggregate([
          { $match: { channel: channelFilter, date: { $gte: start, $lte: end } } },
          { $group: { _id: null, totalLiveRevenue: { $sum: "$liveRevenue" } } }
        ]),
        this.shopeeIncomeModel.aggregate([
          {
            $match: {
              channel: channelFilter,
              orderDate: { $gte: start, $lte: end }
            }
          },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalIncomeRevenue: { $sum: { $sum: "$products.buyerPaidTotal" } }
            }
          }
        ])
      ])

      const revenueKpi = kpis.reduce(
        (sum, item) => sum + (Number(item.revenueKpi) || 0),
        0
      )
      const adsCostKpi = kpis.reduce(
        (sum, item) => sum + (Number(item.adsCostKpi) || 0),
        0
      )

      const roasWeight = kpis.reduce(
        (sum, item) => sum + Math.max(0, Number(item.adsCostKpi) || 0),
        0
      )
      const roasKpi =
        roasWeight > 0
          ? Number(
              (
                kpis.reduce(
                  (sum, item) =>
                    sum +
                    (Number(item.roasKpi) || 0) *
                      Math.max(0, Number(item.adsCostKpi) || 0),
                  0
                ) / roasWeight
              ).toFixed(4)
            )
          : Number(
              (
                kpis.reduce((sum, item) => sum + (Number(item.roasKpi) || 0), 0) /
                Math.max(kpis.length, 1)
              ).toFixed(4)
            )

      const actualRevenue = Number(
        incomeAgg[0]?.totalIncomeRevenue || 0
      )
      const actualLiveRevenue = Number(
        liveRevenueAgg[0]?.totalLiveRevenue || 0
      )
      const actualAdsCost = Number(adsAgg[0]?.totalAdsCost || 0)
      const totalOrders = Number(incomeAgg[0]?.totalOrders || 0)
      const actualRoas =
        actualAdsCost > 0
          ? Number((actualRevenue / actualAdsCost).toFixed(4))
          : 0

      return {
        scope: {
          type: scope,
          month,
          year,
          channelId: selectedChannel?._id?.toString?.() ?? null,
          expectedProgressPercentage: expected.expectedPercentage,
          elapsedDays: expected.elapsedDays,
          totalDays: expected.totalDays,
          currentDate: expected.currentDate
        },
        channel: selectedChannel
          ? {
              _id: selectedChannel._id?.toString?.(),
              name: selectedChannel.name,
              username: selectedChannel.username,
              platform: selectedChannel.platform
            }
          : null,
        targets: {
          revenueKpi,
          adsCostKpi,
          roasKpi
        },
        actuals: {
          revenue: actualRevenue,
          liveRevenue: actualLiveRevenue,
          adsCost: actualAdsCost,
          roas: actualRoas,
          totalOrders
        },
        progress: {
          revenue: this.buildMetricProgress(
            revenueKpi,
            actualRevenue,
            expected.expectedPercentage
          ),
          adsCost: this.buildMetricProgress(
            adsCostKpi,
            actualAdsCost,
            expected.expectedPercentage
          ),
          roas: this.buildMetricProgress(
            roasKpi,
            actualRoas,
            expected.expectedPercentage
          )
        }
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi lấy tổng quan dashboard Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
