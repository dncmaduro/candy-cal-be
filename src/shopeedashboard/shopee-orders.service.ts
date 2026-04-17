import { Injectable } from "@nestjs/common"
import { Types } from "mongoose"
import { ShopeeDashboardRepository } from "./shopee-dashboard.repository"
import {
  fail,
  formatMetaDate,
  monthRange,
  orderDateRange,
  ORDER_SORT_FIELDS,
  parseMonthYear,
  SHOPEE_CURRENCY,
  SHOPEE_TZ,
  toNumber
} from "./shopee-dashboard.utils"
import { OrdersListResponse } from "./types/dashboard.types"

@Injectable()
export class ShopeeOrdersService {
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

  async getOrders(query: {
    channel?: string
    month?: string
    year?: string
    orderFrom?: string
    orderTo?: string
    page?: string
    pageSize?: string
    sortBy?: string
    sortOrder?: string
  }): Promise<OrdersListResponse> {
    const hasMonth = typeof query.month === "string" && query.month !== ""
    const hasYear = typeof query.year === "string" && query.year !== ""
    const hasOrderFrom =
      typeof query.orderFrom === "string" && query.orderFrom !== ""
    const hasOrderTo = typeof query.orderTo === "string" && query.orderTo !== ""
    const hasMonthlyMode = hasMonth || hasYear
    const hasRangeMode = hasOrderFrom || hasOrderTo

    if (hasMonthlyMode && hasRangeMode) {
      fail(
        "INVALID_FILTER_MODE",
        "Do not provide month/year together with orderFrom/orderTo."
      )
    }
    if (!hasMonthlyMode && !hasRangeMode) {
      fail(
        "INVALID_FILTER_MODE",
        "Provide exactly one mode: month/year or orderFrom/orderTo."
      )
    }
    if (hasMonthlyMode && (!hasMonth || !hasYear)) {
      fail("INVALID_FILTER_MODE", "Both month and year are required.")
    }
    if (hasRangeMode && (!hasOrderFrom || !hasOrderTo)) {
      fail("INVALID_FILTER_MODE", "Both orderFrom and orderTo are required.")
    }

    const page = Math.max(1, toNumber(query.page || 1, 1))
    const pageSize = Math.max(1, Math.min(100, toNumber(query.pageSize || 10, 10)))
    const sortBy = (query.sortBy || "orderDate") as
      | "orderDate"
      | "revenue"
      | "orderCode"
      | "productCount"
    if (!ORDER_SORT_FIELDS.includes(sortBy)) {
      fail(
        "INVALID_SORT_BY",
        `sortBy must be one of: ${ORDER_SORT_FIELDS.join(", ")}.`
      )
    }
    const sortOrderRaw = (query.sortOrder || "desc").toLowerCase()
    if (!["asc", "desc"].includes(sortOrderRaw)) {
      fail("INVALID_SORT_ORDER", "sortOrder must be asc or desc.")
    }
    const sortOrder: 1 | -1 = sortOrderRaw === "asc" ? 1 : -1

    const scope = await this.resolveChannelScope(query.channel)
    const time =
      hasMonthlyMode && query.month && query.year
        ? (() => {
            const monthYear = parseMonthYear(query.month as string, query.year as string)
            const monthR = monthRange(monthYear.month, monthYear.year)
            return {
              type: "monthly" as const,
              month: monthYear.month,
              year: monthYear.year,
              orderFrom: monthR.fromText,
              orderTo: monthR.toText,
              start: monthR.start,
              end: monthR.end
            }
          })()
        : (() => {
            const r = orderDateRange(
              query.orderFrom as string,
              query.orderTo as string
            )
            return {
              type: "range" as const,
              orderFrom: r.orderFrom,
              orderTo: r.orderTo,
              start: r.start,
              end: r.end
            }
          })()

    if (!scope.channelFilter) {
      return {
        scope:
          time.type === "monthly"
            ? {
                type: "monthly",
                channel: scope.channel,
                month: time.month,
                year: time.year
              }
            : {
                type: "range",
                channel: scope.channel,
                orderFrom: time.orderFrom,
                orderTo: time.orderTo
              },
        pagination: {
          page,
          pageSize,
          totalItems: 0,
          totalPages: 0
        },
        items: [],
        meta: {
          lastSyncedAt: null,
          timezone: SHOPEE_TZ,
          currency: SHOPEE_CURRENCY
        }
      }
    }

    const [ordersResult, lastSyncedAt] = await Promise.all([
      this.repo.queryOrders({
        channelFilter: scope.channelFilter,
        start: time.start,
        end: time.end,
        page,
        pageSize,
        sortBy,
        sortOrder
      }),
      this.repo.getLastSyncedAt(scope.channelFilter)
    ])

    const totalPages =
      ordersResult.totalItems > 0
        ? Math.ceil(ordersResult.totalItems / pageSize)
        : 0

    return {
      scope:
        time.type === "monthly"
          ? {
              type: "monthly",
              channel: scope.channel,
              month: time.month,
              year: time.year
            }
          : {
              type: "range",
              channel: scope.channel,
              orderFrom: time.orderFrom,
              orderTo: time.orderTo
            },
      pagination: {
        page,
        pageSize,
        totalItems: ordersResult.totalItems,
        totalPages
      },
      items: ordersResult.items,
      meta: {
        lastSyncedAt: formatMetaDate(lastSyncedAt),
        timezone: SHOPEE_TZ,
        currency: SHOPEE_CURRENCY
      }
    }
  }
}
