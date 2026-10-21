import { Injectable } from "@nestjs/common"
import { Types } from "mongoose"
import { ShopeeDashboardRepository } from "./shopee-dashboard.repository"
import {
  addDays,
  fail,
  formatMetaDate,
  isPartialToday,
  orderDateRange,
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
      const channelIds = await this.repo.listShopeeLivestreamChannelIds()
      if (channelIds.length === 0) {
        return { channel: "all", channelIds: [], channelFilter: null }
      }
      return {
        channel: "all",
        channelIds,
        channelFilter:
          channelIds.length === 1 ? channelIds[0] : { $in: channelIds }
      }
    }

    if (!Types.ObjectId.isValid(channel)) {
      fail("INVALID_CHANNEL", "Channel is invalid.")
    }

    const doc = await this.repo.findShopeeLivestreamChannelById(channel)
    if (!doc) {
      fail("CHANNEL_NOT_FOUND", "Shopee channel not found.")
    }
    return {
      channel,
      channelIds: [doc._id as Types.ObjectId],
      channelFilter: doc._id as Types.ObjectId
    }
  }

  private buildRangeScope(query: {
    channel?: string
    orderFrom: string
    orderTo: string
  }) {
    const range = orderDateRange(query.orderFrom, query.orderTo)
    return { range }
  }

  async getRangeSummary(query: {
    channel?: string
    orderFrom: string
    orderTo: string
  }): Promise<RangeSummaryResponse> {
    const scope = await this.resolveChannelScope(query.channel)
    const { range } = this.buildRangeScope(query)

    if (!scope.channelFilter) {
      return {
        scope: {
          type: "range",
          channel: scope.channel,
          orderFrom: range.orderFrom,
          orderTo: range.orderTo,
          days: range.days
        },
        summary: {
          grossRevenue: 0,
          netRevenue: 0,
          grossOrders: 0,
          netOrders: 0,
          cancelledRevenue: 0,
          cancelledOrders: 0,
          liveRevenue: 0,
          adsCost: 0,
          totalOrders: 0,
          roas: 0,
          aov: 0,
          revenuePerDay: 0,
          ordersPerDay: 0,
          adsCostPerDay: 0,
          beforeCancellation: {
            revenue: 0,
            orders: 0,
            adsCost: 0,
            roas: 0,
            aov: 0
          },
          afterCancellation: {
            revenue: 0,
            orders: 0,
            adsCost: 0,
            roas: 0,
            aov: 0
          }
        },
        meta: {
          lastSyncedAt: null,
          timezone: SHOPEE_TZ,
          currency: SHOPEE_CURRENCY,
          isPartialToday: isPartialToday(range.orderTo)
        }
      }
    }

    const [incomeAgg, adsAgg, liveAgg, lastSyncedAt] = await Promise.all([
      this.repo.aggregateIncomesSummary(
        scope.channelFilter,
        range.start,
        range.end
      ),
      this.repo.aggregateAdsSummary(
        scope.channelFilter,
        range.businessStart,
        range.businessEnd
      ),
      this.repo.aggregateLiveRevenueSummary(
        scope.channelFilter,
        range.businessStart,
        range.businessEnd
      ),
      this.repo.getLastSyncedAt(scope.channelFilter)
    ])

    const grossRevenue = Number(incomeAgg[0]?.grossRevenue || 0)
    const netRevenue = Number(incomeAgg[0]?.netRevenue || 0)
    const grossOrders = Number(incomeAgg[0]?.grossOrders || 0)
    const netOrders = Number(incomeAgg[0]?.netOrders || 0)
    const cancelledRevenue = Number(incomeAgg[0]?.cancelledRevenue || 0)
    const cancelledOrders = Number(incomeAgg[0]?.cancelledOrders || 0)
    const adsCostBeforeCancellation = Number(
      adsAgg[0]?.totalAdsCostBeforeCancellation ??
        adsAgg[0]?.totalAdsCost ??
        0
    )
    const adsCostAfterCancellation = Number(
      adsAgg[0]?.totalAdsCostAfterCancellation ??
        adsAgg[0]?.totalAdsCost ??
        0
    )
    const adsCost = adsCostAfterCancellation
    const liveRevenue = Number(liveAgg[0]?.totalLiveRevenue || 0)
    const grossRoas = round(
      safeDivide(grossRevenue, adsCostBeforeCancellation),
      4
    )
    const netRoas = round(safeDivide(netRevenue, adsCost), 4)
    const grossAov = round(safeDivide(grossRevenue, grossOrders), 2)
    const netAov = round(safeDivide(netRevenue, netOrders), 2)

    return {
      scope: {
        type: "range",
        channel: scope.channel,
        orderFrom: range.orderFrom,
        orderTo: range.orderTo,
        days: range.days
      },
      summary: {
        grossRevenue,
        netRevenue,
        grossOrders,
        netOrders,
        cancelledRevenue,
        cancelledOrders,
        liveRevenue,
        adsCost,
        totalOrders: netOrders,
        roas: netRoas,
        aov: netAov,
        revenuePerDay: round(safeDivide(netRevenue, range.days), 2),
        ordersPerDay: round(safeDivide(netOrders, range.days), 2),
        adsCostPerDay: round(safeDivide(adsCost, range.days), 2),
        beforeCancellation: {
          revenue: grossRevenue,
          orders: grossOrders,
          adsCost: adsCostBeforeCancellation,
          roas: grossRoas,
          aov: grossAov
        },
        afterCancellation: {
          revenue: netRevenue,
          orders: netOrders,
          adsCost: adsCostAfterCancellation,
          roas: netRoas,
          aov: netAov
        }
      },
      meta: {
        lastSyncedAt: formatMetaDate(lastSyncedAt),
        timezone: SHOPEE_TZ,
        currency: SHOPEE_CURRENCY,
        isPartialToday: isPartialToday(range.orderTo)
      }
    }
  }

  async getRangeTimeseries(query: {
    channel?: string
    orderFrom: string
    orderTo: string
  }): Promise<RangeTimeseriesResponse> {
    const scope = await this.resolveChannelScope(query.channel)
    const { range } = this.buildRangeScope(query)

    if (!scope.channelFilter) {
      const series: RangeTimeseriesPoint[] = []
      for (let i = 0; i < range.days; i++) {
        const d = addDays(range.orderFrom, i)
        series.push({
          orderDate: d,
          grossRevenue: 0,
          grossOrders: 0,
          revenue: 0,
          liveRevenue: 0,
          grossAdsCost: 0,
          netAdsCost: 0,
          adsCost: 0,
          orders: 0,
          grossRoas: 0,
          roas: 0,
          aov: 0
        })
      }
      return {
        scope: {
          type: "range",
          channel: scope.channel,
          orderFrom: range.orderFrom,
          orderTo: range.orderTo,
          days: range.days
        },
        series,
        meta: {
          lastSyncedAt: null,
          timezone: SHOPEE_TZ,
          currency: SHOPEE_CURRENCY,
          isPartialToday: isPartialToday(range.orderTo)
        }
      }
    }

    const [incomes, ads, live, lastSyncedAt] = await Promise.all([
      this.repo.aggregateIncomeTimeseries(
        scope.channelFilter,
        range.start,
        range.end
      ),
      this.repo.aggregateAdsTimeseries(
        scope.channelFilter,
        range.businessStart,
        range.businessEnd
      ),
      this.repo.aggregateLiveRevenueTimeseries(
        scope.channelFilter,
        range.businessStart,
        range.businessEnd
      ),
      this.repo.getLastSyncedAt(scope.channelFilter)
    ])

    const map = new Map<string, RangeTimeseriesPoint>()
    for (let i = 0; i < range.days; i++) {
      const orderDate = addDays(range.orderFrom, i)
      map.set(orderDate, {
        orderDate,
        grossRevenue: 0,
        grossOrders: 0,
        revenue: 0,
        liveRevenue: 0,
        grossAdsCost: 0,
        netAdsCost: 0,
        adsCost: 0,
        orders: 0,
        grossRoas: 0,
        roas: 0,
        aov: 0
      })
    }

    incomes.forEach((item) => {
      const row = map.get(item.orderDate)
      if (!row) return
      row.grossRevenue = Number(item.grossRevenue || 0)
      row.grossOrders = Number(item.grossOrders || 0)
      row.revenue = Number(item.netRevenue || 0)
      row.orders = Number(item.netOrders || 0)
    })

    ads.forEach((item) => {
      const row = map.get(item.date)
      if (!row) return
      row.grossAdsCost = Number(item.grossAdsCost ?? item.adsCost ?? 0)
      row.netAdsCost = Number(item.netAdsCost ?? item.adsCost ?? 0)
      row.adsCost = row.netAdsCost
    })

    live.forEach((item) => {
      const row = map.get(item.date)
      if (!row) return
      row.liveRevenue = Number(item.liveRevenue || 0)
    })

    const series = Array.from(map.values())
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate))
      .map((item) => ({
        ...item,
        grossRoas: round(safeDivide(item.grossRevenue, item.grossAdsCost), 4),
        roas: round(safeDivide(item.revenue, item.netAdsCost), 4),
        aov: round(safeDivide(item.revenue, item.orders), 2)
      }))

    return {
      scope: {
        type: "range",
        channel: scope.channel,
        orderFrom: range.orderFrom,
        orderTo: range.orderTo,
        days: range.days
      },
      series,
      meta: {
        lastSyncedAt: formatMetaDate(lastSyncedAt),
        timezone: SHOPEE_TZ,
        currency: SHOPEE_CURRENCY,
        isPartialToday: isPartialToday(range.orderTo)
      }
    }
  }

  async getRangeCompare(query: {
    channel?: string
    orderFrom: string
    orderTo: string
    compare?: string
  }) {
    if (query.compare !== "previous_period") {
      fail("INVALID_COMPARE_MODE", "compare must be previous_period.")
    }

    const current = await this.getRangeSummary(query)
    const previousTo = addDays(current.scope.orderFrom, -1)
    const previousFrom = addDays(previousTo, -(current.scope.days - 1))
    const previous = await this.getRangeSummary({
      channel: query.channel,
      orderFrom: previousFrom,
      orderTo: previousTo
    })

    return {
      scope: current.scope,
      compare: "previous_period",
      current: current.summary,
      previous: previous.summary,
      delta: {
        revenue: round(
          current.summary.netRevenue - previous.summary.netRevenue,
          2
        ),
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
