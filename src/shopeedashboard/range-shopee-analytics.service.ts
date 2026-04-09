import { Injectable } from "@nestjs/common"
import { Types } from "mongoose"
import { ShopeeDashboardRepository } from "./shopee-dashboard.repository"
import {
  addDays,
  dateRange,
  fail,
  formatMetaDate,
  isPartialToday,
  round,
  safeDivide,
  SHOPEE_CURRENCY,
  SHOPEE_TZ
} from "./shopee-dashboard.utils"
import {
  RangeSummaryResponse,
  RangeTimeseriesPoint,
  RangeTimeseriesResponse
} from "./types/dashboard.types"

@Injectable()
export class RangeShopeeAnalyticsService {
  constructor(private readonly repo: ShopeeDashboardRepository) {}

  private async resolveChannelScope(channel?: string): Promise<{
    channel: string
    channelIds: Types.ObjectId[]
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] } | null
  }> {
    if (!channel || channel === "all") {
      const channelIds = await this.repo.listShopeeChannelIds()
      if (channelIds.length === 0) {
        return { channel: "all", channelIds: [], channelFilter: null }
      }
      return {
        channel: "all",
        channelIds,
        channelFilter: channelIds.length === 1 ? channelIds[0] : { $in: channelIds }
      }
    }

    if (!Types.ObjectId.isValid(channel)) {
      fail("INVALID_CHANNEL", "Channel is invalid.")
    }

    const doc = await this.repo.findShopeeChannelById(channel)
    if (!doc) {
      fail("CHANNEL_NOT_FOUND", "Shopee channel not found.")
    }
    return {
      channel,
      channelIds: [doc._id as Types.ObjectId],
      channelFilter: doc._id as Types.ObjectId
    }
  }

  private buildRangeScope(query: { channel?: string; from: string; to: string }) {
    const range = dateRange(query.from, query.to)
    return { range }
  }

  async getRangeSummary(query: {
    channel?: string
    from: string
    to: string
  }): Promise<RangeSummaryResponse> {
    const scope = await this.resolveChannelScope(query.channel)
    const { range } = this.buildRangeScope(query)

    if (!scope.channelFilter) {
      return {
        scope: {
          type: "range",
          channel: scope.channel,
          from: range.from,
          to: range.to,
          days: range.days
        },
        summary: {
          grossRevenue: 0,
          netRevenue: 0,
          liveRevenue: 0,
          adsCost: 0,
          totalOrders: 0,
          roas: 0,
          aov: 0,
          revenuePerDay: 0,
          ordersPerDay: 0,
          adsCostPerDay: 0
        },
        meta: {
          lastSyncedAt: null,
          timezone: SHOPEE_TZ,
          currency: SHOPEE_CURRENCY,
          isPartialToday: isPartialToday(range.to)
        }
      }
    }

    const [incomeAgg, adsAgg, liveAgg, lastSyncedAt] = await Promise.all([
      this.repo.aggregateIncomesSummary(scope.channelFilter, range.start, range.end),
      this.repo.aggregateAdsSummary(scope.channelFilter, range.start, range.end),
      this.repo.aggregateLiveRevenueSummary(scope.channelFilter, range.start, range.end),
      this.repo.getLastSyncedAt(scope.channelFilter)
    ])

    const grossRevenue = Number(incomeAgg[0]?.totalRevenue || 0)
    const netRevenue = grossRevenue
    const totalOrders = Number(incomeAgg[0]?.totalOrders || 0)
    const adsCost = Number(adsAgg[0]?.totalAdsCost || 0)
    const liveRevenue = Number(liveAgg[0]?.totalLiveRevenue || 0)
    const roas = round(safeDivide(netRevenue, adsCost), 4)
    const aov = round(safeDivide(netRevenue, totalOrders), 2)

    return {
      scope: {
        type: "range",
        channel: scope.channel,
        from: range.from,
        to: range.to,
        days: range.days
      },
      summary: {
        grossRevenue,
        netRevenue,
        liveRevenue,
        adsCost,
        totalOrders,
        roas,
        aov,
        revenuePerDay: round(safeDivide(netRevenue, range.days), 2),
        ordersPerDay: round(safeDivide(totalOrders, range.days), 2),
        adsCostPerDay: round(safeDivide(adsCost, range.days), 2)
      },
      meta: {
        lastSyncedAt: formatMetaDate(lastSyncedAt),
        timezone: SHOPEE_TZ,
        currency: SHOPEE_CURRENCY,
        isPartialToday: isPartialToday(range.to)
      }
    }
  }

  async getRangeTimeseries(query: {
    channel?: string
    from: string
    to: string
  }): Promise<RangeTimeseriesResponse> {
    const scope = await this.resolveChannelScope(query.channel)
    const { range } = this.buildRangeScope(query)

    if (!scope.channelFilter) {
      const series: RangeTimeseriesPoint[] = []
      for (let i = 0; i < range.days; i++) {
        const d = addDays(range.from, i)
        series.push({
          date: d,
          revenue: 0,
          liveRevenue: 0,
          adsCost: 0,
          orders: 0,
          roas: 0,
          aov: 0
        })
      }
      return {
        scope: {
          type: "range",
          channel: scope.channel,
          from: range.from,
          to: range.to,
          days: range.days
        },
        series,
        meta: {
          lastSyncedAt: null,
          timezone: SHOPEE_TZ,
          currency: SHOPEE_CURRENCY,
          isPartialToday: isPartialToday(range.to)
        }
      }
    }

    const [incomes, ads, live, lastSyncedAt] = await Promise.all([
      this.repo.aggregateIncomeTimeseries(scope.channelFilter, range.start, range.end),
      this.repo.aggregateAdsTimeseries(scope.channelFilter, range.start, range.end),
      this.repo.aggregateLiveRevenueTimeseries(scope.channelFilter, range.start, range.end),
      this.repo.getLastSyncedAt(scope.channelFilter)
    ])

    const map = new Map<string, RangeTimeseriesPoint>()
    for (let i = 0; i < range.days; i++) {
      const date = addDays(range.from, i)
      map.set(date, {
        date,
        revenue: 0,
        liveRevenue: 0,
        adsCost: 0,
        orders: 0,
        roas: 0,
        aov: 0
      })
    }

    incomes.forEach((item) => {
      const row = map.get(item.date)
      if (!row) return
      row.revenue = Number(item.revenue || 0)
      row.orders = Number(item.orders || 0)
    })

    ads.forEach((item) => {
      const row = map.get(item.date)
      if (!row) return
      row.adsCost = Number(item.adsCost || 0)
    })

    live.forEach((item) => {
      const row = map.get(item.date)
      if (!row) return
      row.liveRevenue = Number(item.liveRevenue || 0)
    })

    const series = Array.from(map.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({
        ...item,
        roas: round(safeDivide(item.revenue, item.adsCost), 4),
        aov: round(safeDivide(item.revenue, item.orders), 2)
      }))

    return {
      scope: {
        type: "range",
        channel: scope.channel,
        from: range.from,
        to: range.to,
        days: range.days
      },
      series,
      meta: {
        lastSyncedAt: formatMetaDate(lastSyncedAt),
        timezone: SHOPEE_TZ,
        currency: SHOPEE_CURRENCY,
        isPartialToday: isPartialToday(range.to)
      }
    }
  }

  async getRangeCompare(query: {
    channel?: string
    from: string
    to: string
    compare?: string
  }) {
    if (query.compare !== "previous_period") {
      fail(
        "INVALID_COMPARE_MODE",
        "compare must be previous_period."
      )
    }

    const current = await this.getRangeSummary(query)
    const previousTo = addDays(current.scope.from, -1)
    const previousFrom = addDays(previousTo, -(current.scope.days - 1))
    const previous = await this.getRangeSummary({
      channel: query.channel,
      from: previousFrom,
      to: previousTo
    })

    return {
      scope: current.scope,
      compare: "previous_period",
      current: current.summary,
      previous: previous.summary,
      delta: {
        revenue: round(current.summary.netRevenue - previous.summary.netRevenue, 2),
        liveRevenue: round(
          current.summary.liveRevenue - previous.summary.liveRevenue,
          2
        ),
        adsCost: round(current.summary.adsCost - previous.summary.adsCost, 2),
        totalOrders: current.summary.totalOrders - previous.summary.totalOrders,
        roas: round(current.summary.roas - previous.summary.roas, 4),
        aov: round(current.summary.aov - previous.summary.aov, 2)
      },
      meta: current.meta
    }
  }
}
