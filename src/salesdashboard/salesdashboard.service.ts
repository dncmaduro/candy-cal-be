import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { SalesOrder } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"

export interface RevenueByItem {
  code: string
  name: string
  quantity: number
  revenue: number
}

export interface RevenueByChannel {
  channelId: string
  channelName: string
  revenue: number
  orderCount: number
}

export interface RevenueByUser {
  userId: string
  userName: string
  revenue: number
  orderCount: number
  ordersByCustomerType: {
    new: number
    returning: number
  }
  revenueByCustomerType: {
    new: number
    returning: number
  }
}

export interface RevenueStatsResponse {
  totalRevenue: number
  totalOrders: number
  revenueFromNewCustomers: number
  revenueFromReturningCustomers: number
  topItemsByRevenue: Omit<RevenueByItem, "quantity">[]
  topItemsByQuantity: Omit<RevenueByItem, "revenue">[]
  revenueByChannel: RevenueByChannel[]
  revenueByUser: RevenueByUser[]
  otherItemsRevenue: number
}

export interface MetricsResponse {
  cac: number // Customer Acquisition Cost
  crr: number // Customer Retention Rate
  churnRate: number
  conversionRate: number
  avgDealSize: number
  salesCycleLength: number // in days
  stageTransitions: {
    lead: number
    contacted: number
    customer: number
    closed: number
  }
}

@Injectable()
export class SalesDashboardService {
  constructor(
    @InjectModel("salesorders")
    private readonly salesOrderModel: Model<SalesOrder>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>
  ) {}

  async getRevenueStats(
    startDate: Date,
    endDate: Date
  ): Promise<RevenueStatsResponse> {
    try {
      // Set time boundaries
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      // Get all orders in date range (only official status)
      const orders = await this.salesOrderModel
        .find({
          date: { $gte: start, $lte: end },
          status: "official"
        })
        .populate({
          path: "salesFunnelId",
          populate: [
            { path: "channel", select: "channelName" },
            { path: "user", select: "name" }
          ]
        })
        .lean()

      // Calculate total revenue and total orders
      const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0)
      const totalOrders = orders.length

      // Calculate revenue from new vs returning customers
      let revenueFromNewCustomers = 0
      let revenueFromReturningCustomers = 0

      orders.forEach((order) => {
        if (order.returning) {
          revenueFromReturningCustomers += order.total
        } else {
          revenueFromNewCustomers += order.total
        }
      })

      // Calculate items sold with revenue from item.price * item.quantity
      const itemsMap = new Map<string, RevenueByItem>()
      orders.forEach((order) => {
        order.items.forEach((item) => {
          const existing = itemsMap.get(item.code)
          if (existing) {
            existing.quantity += item.quantity
            // Revenue is calculated from price stored in order item
            existing.revenue += item.price * item.quantity
          } else {
            itemsMap.set(item.code, {
              code: item.code,
              name: item.name,
              quantity: item.quantity,
              // Revenue is calculated from price stored in order item
              revenue: item.price * item.quantity
            })
          }
        })
      })

      // Create two separate top 10 lists
      const allItems = Array.from(itemsMap.values())
      const topItemsByRevenue = [...allItems]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10)
        .map(({ code, name, revenue }) => ({ code, name, revenue }))
      const topItemsByQuantity = [...allItems]
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 10)
        .map(({ code, name, quantity }) => ({ code, name, quantity }))

      // Calculate other items revenue (items not in top 10 by revenue)
      const top10RevenueCodes = new Set(
        topItemsByRevenue.map((item) => item.code)
      )
      const otherItemsRevenue = allItems
        .filter((item) => !top10RevenueCodes.has(item.code))
        .reduce((sum, item) => sum + item.revenue, 0)

      // Calculate revenue by channel
      const channelMap = new Map<string, RevenueByChannel>()
      for (const order of orders) {
        const funnel = order.salesFunnelId as any
        if (funnel && funnel.channel) {
          const channelId = funnel.channel._id
            ? funnel.channel._id.toString()
            : funnel.channel.toString()
          const channelName = funnel.channel.channelName || "Unknown"

          const existing = channelMap.get(channelId)
          if (existing) {
            existing.revenue += order.total
            existing.orderCount += 1
          } else {
            channelMap.set(channelId, {
              channelId,
              channelName,
              revenue: order.total,
              orderCount: 1
            })
          }
        }
      }
      const revenueByChannel = Array.from(channelMap.values()).sort(
        (a, b) => b.revenue - a.revenue
      )

      // Calculate revenue by user (with new/returning split)
      const userMap = new Map<string, RevenueByUser>()
      for (const order of orders) {
        const funnel = order.salesFunnelId as any
        if (funnel && funnel.user) {
          const userId = funnel.user._id
            ? funnel.user._id.toString()
            : funnel.user.toString()
          const userName = funnel.user.name || "Unknown"

          const existing = userMap.get(userId)
          if (existing) {
            existing.revenue += order.total
            existing.orderCount += 1

            // Update order count by customer type
            if (order.returning) {
              existing.ordersByCustomerType.returning += 1
              existing.revenueByCustomerType.returning += order.total
            } else {
              existing.ordersByCustomerType.new += 1
              existing.revenueByCustomerType.new += order.total
            }
          } else {
            userMap.set(userId, {
              userId,
              userName,
              revenue: order.total,
              orderCount: 1,
              ordersByCustomerType: {
                new: order.returning ? 0 : 1,
                returning: order.returning ? 1 : 0
              },
              revenueByCustomerType: {
                new: order.returning ? 0 : order.total,
                returning: order.returning ? order.total : 0
              }
            })
          }
        }
      }
      const revenueByUser = Array.from(userMap.values()).sort(
        (a, b) => b.revenue - a.revenue
      )

      return {
        totalRevenue,
        totalOrders,
        revenueFromNewCustomers,
        revenueFromReturningCustomers,
        topItemsByRevenue,
        topItemsByQuantity,
        revenueByChannel,
        revenueByUser,
        otherItemsRevenue
      }
    } catch (error) {
      console.error("Error in getRevenueStats:", error)
      throw new HttpException(
        "Lỗi khi lấy thống kê doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getMonthlyMetrics(
    year: number,
    month: number
  ): Promise<MetricsResponse> {
    try {
      // Month boundaries
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0)
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

      // Get all orders in this month (only official status)
      const orders = await this.salesOrderModel
        .find({
          date: { $gte: startOfMonth, $lte: endOfMonth },
          status: "official"
        })
        .populate({
          path: "salesFunnelId",
          populate: [
            { path: "channel", select: "channelName" },
            { path: "user", select: "name" }
          ]
        })
        .lean()

      // Calculate Average Deal Size
      const avgDealSize =
        orders.length > 0
          ? orders.reduce((sum, order) => sum + order.total, 0) / orders.length
          : 0

      // Get all funnels for this month's analysis
      const allFunnels = await this.salesFunnelModel
        .find()
        .populate("channel", "channelName")
        .populate("user", "name")
        .lean()

      // Count new customers in this month (first order in this month with returning = false)
      const newCustomerFunnelIds = new Set<string>()
      orders.forEach((order) => {
        if (!order.returning && order.salesFunnelId) {
          newCustomerFunnelIds.add(order.salesFunnelId.toString())
        }
      })
      const newCustomersCount = newCustomerFunnelIds.size

      // Get total marketing cost for new customers
      const newCustomerFunnels = allFunnels.filter((f) =>
        newCustomerFunnelIds.has(f._id.toString())
      )
      const totalMarketingCost = newCustomerFunnels.reduce(
        (sum, f) => sum + (f.cost || 0),
        0
      )

      // Calculate CAC
      const cac =
        newCustomersCount > 0 ? totalMarketingCost / newCustomersCount : 0

      // Count customers at start of month (not closed)
      const customersAtStartOfMonth = allFunnels.filter(
        (f) => f.createdAt < startOfMonth && f.stage !== "closed"
      ).length

      // Count customers at end of month (not closed)
      const customersAtEndOfMonth = allFunnels.filter(
        (f) => f.createdAt <= endOfMonth && f.stage !== "closed"
      ).length

      // Calculate CRR
      const crr =
        customersAtStartOfMonth > 0
          ? ((customersAtEndOfMonth - newCustomersCount) /
              customersAtStartOfMonth) *
            100
          : 0

      // Calculate Churn Rate
      const churnRate = 100 - crr

      // Calculate Conversion Rate (contacted -> customer)
      const contactedToCustomer = allFunnels.filter((f) => {
        if (!f.updateStageLogs || f.updateStageLogs.length === 0) return false

        // Check if there was a transition from contacted to customer in this month
        for (let i = 0; i < f.updateStageLogs.length - 1; i++) {
          const current = f.updateStageLogs[i]
          const next = f.updateStageLogs[i + 1]

          if (
            current.stage === "contacted" &&
            next.stage === "customer" &&
            new Date(next.updatedAt) >= startOfMonth &&
            new Date(next.updatedAt) <= endOfMonth
          ) {
            return true
          }
        }
        return false
      }).length

      const totalContacted = allFunnels.filter((f) => {
        if (!f.updateStageLogs || f.updateStageLogs.length === 0) return false

        // Check if reached contacted stage in or before this month
        return f.updateStageLogs.some(
          (log) =>
            log.stage === "contacted" && new Date(log.updatedAt) <= endOfMonth
        )
      }).length

      const conversionRate =
        totalContacted > 0 ? (contactedToCustomer / totalContacted) * 100 : 0

      // Calculate Sales Cycle Length (contacted -> customer)
      const salesCycles: number[] = []
      allFunnels.forEach((f) => {
        if (!f.updateStageLogs || f.updateStageLogs.length === 0) return

        let contactedDate: Date | null = null
        let customerDate: Date | null = null

        f.updateStageLogs.forEach((log) => {
          if (log.stage === "contacted" && !contactedDate) {
            contactedDate = new Date(log.updatedAt)
          }
          if (log.stage === "customer" && contactedDate && !customerDate) {
            customerDate = new Date(log.updatedAt)
          }
        })

        if (
          contactedDate &&
          customerDate &&
          customerDate >= startOfMonth &&
          customerDate <= endOfMonth
        ) {
          const cycleLength = Math.ceil(
            (customerDate.getTime() - contactedDate.getTime()) /
              (1000 * 60 * 60 * 24)
          )
          salesCycles.push(cycleLength)
        }
      })

      const salesCycleLength =
        salesCycles.length > 0
          ? salesCycles.reduce((sum, len) => sum + len, 0) / salesCycles.length
          : 0

      // Calculate stage transitions in this month
      const stageTransitions = {
        lead: 0,
        contacted: 0,
        customer: 0,
        closed: 0
      }

      allFunnels.forEach((f) => {
        if (!f.updateStageLogs || f.updateStageLogs.length === 0) return

        f.updateStageLogs.forEach((log) => {
          const logDate = new Date(log.updatedAt)
          if (logDate >= startOfMonth && logDate <= endOfMonth) {
            stageTransitions[log.stage]++
          }
        })
      })

      return {
        cac: Math.round(cac),
        crr: Math.round(crr * 100) / 100,
        churnRate: Math.round(churnRate * 100) / 100,
        conversionRate: Math.round(conversionRate * 100) / 100,
        avgDealSize: Math.round(avgDealSize),
        salesCycleLength: Math.round(salesCycleLength * 100) / 100,
        stageTransitions
      }
    } catch (error) {
      console.error("Error in getMonthlyMetrics:", error)
      throw new HttpException(
        "Lỗi khi lấy chỉ số tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
