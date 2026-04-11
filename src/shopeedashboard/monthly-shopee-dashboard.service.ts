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

  private buildSummaryNumbers(raw: {
    revenueTarget: number
    adsCostTarget: number
    roasTarget: number
    currentRevenue: number
    liveRevenue: number
    adsCost: number
    totalOrders: number
    expectedProgressPercent: number
  }) {
    const roas = round(safeDivide(raw.currentRevenue, raw.adsCost), 4)
    return {
      currentRevenue: raw.currentRevenue,
      revenueTarget: raw.revenueTarget,
      liveRevenue: raw.liveRevenue,
      adsCost: raw.adsCost,
      adsCostTarget: raw.adsCostTarget,
      roas,
      roasTarget: raw.roasTarget,
      totalOrders: raw.totalOrders,
      expectedProgressPercent: raw.expectedProgressPercent,
      actualRevenueProgressPercent: toProgress(raw.currentRevenue, raw.revenueTarget),
      actualAdsCostProgressPercent: toProgress(raw.adsCost, raw.adsCostTarget),
      actualRoasProgressPercent: toProgress(roas, raw.roasTarget)
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
          currentRevenue: 0,
          liveRevenue: 0,
          adsCost: 0,
          totalOrders: 0,
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

    const currentRevenue = Number(incomeAgg[0]?.totalRevenue || 0)
    const totalOrders = Number(incomeAgg[0]?.totalOrders || 0)
    const adsCost = Number(adsAgg[0]?.totalAdsCost || 0)
    const liveRevenue = Number(liveAgg[0]?.totalLiveRevenue || 0)

    return {
      scope: { type: "monthly", channel: scope.channel, month, year },
      summary: this.buildSummaryNumbers({
        revenueTarget,
        adsCostTarget,
        roasTarget,
        currentRevenue,
        liveRevenue,
        adsCost,
        totalOrders,
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
