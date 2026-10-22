import { Injectable } from "@nestjs/common"
import { Types } from "mongoose"
import {
  expectedMonthlyProgress,
  fail,
  formatMetaDate,
  monthRange,
  parseMonthYear,
  round,
  safeDivide,
  SHOPEE_CURRENCY,
  SHOPEE_TZ,
  toKpiStatus,
  toProgress,
  toSpeed
} from "./shopee-dashboard.utils"
import { ShopeeDashboardRepository } from "./shopee-dashboard.repository"
import {
  MonthlyKpisResponse,
  MonthlySummaryResponse
} from "./types/dashboard.types"

@Injectable()
export class MonthlyShopeeDashboardService {
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
        channelFilter: channelIds.length === 1 ? channelIds[0] : { $in: channelIds }
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

  private buildSummaryNumbers(raw: {
    revenueTarget: number
    adsCostTarget: number
    roasTarget: number
    grossRevenue: number
    netRevenue: number
    grossOrders: number
    netOrders: number
    liveRevenue: number
    adsCostBeforeCancellation: number
    adsCostAfterCancellation: number
    expectedProgressPercent: number
  }) {
    const beforeRoas = round(
      safeDivide(raw.grossRevenue, raw.adsCostBeforeCancellation),
      4
    )
    const afterRoas = round(
      safeDivide(raw.netRevenue, raw.adsCostAfterCancellation),
      4
    )
    return {
      currentRevenue: raw.netRevenue,
      revenueTarget: raw.revenueTarget,
      liveRevenue: raw.liveRevenue,
      adsCost: raw.adsCostAfterCancellation,
      adsCostTarget: raw.adsCostTarget,
      roas: afterRoas,
      roasTarget: raw.roasTarget,
      totalOrders: raw.netOrders,
      beforeCancellation: {
        revenue: raw.grossRevenue,
        orders: raw.grossOrders,
        adsCost: raw.adsCostBeforeCancellation,
        roas: beforeRoas
      },
      afterCancellation: {
        revenue: raw.netRevenue,
        orders: raw.netOrders,
        adsCost: raw.adsCostAfterCancellation,
        roas: afterRoas
      },
      expectedProgressPercent: raw.expectedProgressPercent,
      actualRevenueProgressPercent: toProgress(raw.netRevenue, raw.revenueTarget),
      actualAdsCostProgressPercent: toProgress(
        raw.adsCostAfterCancellation,
        raw.adsCostTarget
      ),
      actualRoasProgressPercent: toProgress(afterRoas, raw.roasTarget)
    }
  }

  async getMonthlySummary(query: {
    channel?: string
    month: string
    year: string
  }): Promise<MonthlySummaryResponse> {
    const { month, year } = parseMonthYear(query.month, query.year)
    const scope = await this.resolveChannelScope(query.channel)
    const expectedProgressPercent = expectedMonthlyProgress(month, year)
    const { start, end } = monthRange(month, year)

    if (!scope.channelFilter) {
      return {
        scope: { type: "monthly", channel: scope.channel, month, year },
        summary: this.buildSummaryNumbers({
          revenueTarget: 0,
          adsCostTarget: 0,
          roasTarget: 0,
          grossRevenue: 0,
          netRevenue: 0,
          grossOrders: 0,
          netOrders: 0,
          liveRevenue: 0,
          adsCostBeforeCancellation: 0,
          adsCostAfterCancellation: 0,
          expectedProgressPercent
        }),
        meta: {
          lastSyncedAt: null,
          timezone: SHOPEE_TZ,
          currency: SHOPEE_CURRENCY
        }
      }
    }

    const [targetsAgg, incomeAgg, adsAgg, liveAgg, lastSyncedAt] =
      await Promise.all([
        this.repo.aggregateMonthlyTargets(scope.channelFilter, month, year),
        this.repo.aggregateIncomesSummary(scope.channelFilter, start, end),
        this.repo.aggregateAdsSummary(scope.channelFilter, start, end),
        this.repo.aggregateLiveRevenueSummary(scope.channelFilter, start, end),
        this.repo.getLastSyncedAt(scope.channelFilter)
      ])

    const targetRow = targetsAgg[0] || {}
    const revenueTarget = Number(targetRow.revenueTarget || 0)
    const adsCostTarget = Number(targetRow.adsCostTarget || 0)
    const roasTarget =
      Number(targetRow.roasWeight || 0) > 0
        ? round(
            safeDivide(
              Number(targetRow.roasWeightedValue || 0),
              Number(targetRow.roasWeight || 0)
            ),
            4
          )
        : round(Number(targetRow.roasAvgValue || 0), 4)

    const grossRevenue = Number(
      incomeAgg[0]?.grossRevenue ?? incomeAgg[0]?.totalRevenue ?? 0
    )
    const netRevenue = Number(incomeAgg[0]?.netRevenue || 0)
    const grossOrders = Number(
      incomeAgg[0]?.grossOrders ?? incomeAgg[0]?.totalOrders ?? 0
    )
    const netOrders = Number(incomeAgg[0]?.netOrders || 0)
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
    const liveRevenue = Number(liveAgg[0]?.totalLiveRevenue || 0)

    return {
      scope: { type: "monthly", channel: scope.channel, month, year },
      summary: this.buildSummaryNumbers({
        revenueTarget,
        adsCostTarget,
        roasTarget,
        grossRevenue,
        netRevenue,
        grossOrders,
        netOrders,
        liveRevenue,
        adsCostBeforeCancellation,
        adsCostAfterCancellation,
        expectedProgressPercent
      }),
      meta: {
        lastSyncedAt: formatMetaDate(lastSyncedAt),
        timezone: SHOPEE_TZ,
        currency: SHOPEE_CURRENCY
      }
    }
  }

  async getMonthlyKpis(query: {
    channel?: string
    month: string
    year: string
  }): Promise<MonthlyKpisResponse> {
    const summary = await this.getMonthlySummary(query)
    const expected = summary.summary.expectedProgressPercent

    const revenueActual = summary.summary.currentRevenue
    const revenueTarget = summary.summary.revenueTarget
    const revenueProgress = toProgress(revenueActual, revenueTarget)
    const revenueDelta = round(revenueProgress - expected, 2)

    const adsActual = summary.summary.adsCost
    const adsTarget = summary.summary.adsCostTarget
    const adsProgress = toProgress(adsActual, adsTarget)
    const adsDelta = round(adsProgress - expected, 2)

    const roasActual = summary.summary.roas
    const roasTarget = summary.summary.roasTarget
    const roasProgress = toProgress(roasActual, roasTarget)
    const roasDelta = round(roasProgress - expected, 2)

    return {
      scope: summary.scope,
      kpis: [
        {
          key: "revenue",
          label: "KPI doanh thu",
          actual: revenueActual,
          target: revenueTarget,
          expectedProgressPercent: expected,
          actualProgressPercent: revenueProgress,
          deltaPercent: revenueDelta,
          speedMultiplier: toSpeed(revenueProgress, expected),
          status: toKpiStatus(revenueTarget, revenueDelta)
        },
        {
          key: "adsCost",
          label: "KPI chi phí ads",
          actual: adsActual,
          target: adsTarget,
          expectedProgressPercent: expected,
          actualProgressPercent: adsProgress,
          deltaPercent: adsDelta,
          speedMultiplier: toSpeed(adsProgress, expected),
          status: toKpiStatus(adsTarget, adsDelta)
        },
        {
          key: "roas",
          label: "KPI ROAS",
          actual: roasActual,
          target: roasTarget,
          expectedProgressPercent: expected,
          actualProgressPercent: roasProgress,
          deltaPercent: roasDelta,
          speedMultiplier: toSpeed(roasProgress, expected),
          status: toKpiStatus(roasTarget, roasDelta)
        }
      ],
      meta: summary.meta
    }
  }
}
