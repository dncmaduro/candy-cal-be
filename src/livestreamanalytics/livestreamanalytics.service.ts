import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import {
  Livestream,
  LivestreamSnapshotEmbedded
} from "../database/mongoose/schemas/Livestream"

@Injectable()
export class LivestreamanalyticsService {
  constructor(
    @InjectModel("livestreams")
    private readonly livestreamModel: Model<Livestream>
  ) {}

  // Get monthly totals for orders, income and ads
  async getMonthlyTotals(
    year: number,
    month: number
  ): Promise<{ totalOrders: number; totalIncome: number; totalAds: number }> {
    try {
      // month: 1-12
      const start = new Date(year, month - 1, 1)
      const end = new Date(year, month, 1)

      const res = await this.livestreamModel.aggregate([
        { $match: { date: { $gte: start, $lt: end } } },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: "$totalOrders" },
            totalIncome: { $sum: "$totalIncome" },
            totalAds: { $sum: "$ads" }
          }
        }
      ])

      if (!res || res.length === 0)
        return { totalOrders: 0, totalIncome: 0, totalAds: 0 }
      return {
        totalOrders: res[0].totalOrders ?? 0,
        totalIncome: res[0].totalIncome ?? 0,
        totalAds: res[0].totalAds ?? 0
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Get statistics for livestreams in a date range
  async getLivestreamStats(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalIncome: number
    totalExpenses: number
    totalOrders: number
    incomeByAssignee: { assigneeId: string; income: number }[]
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new HttpException("Invalid date range", HttpStatus.BAD_REQUEST)
      }

      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .exec()

      let totalIncome = 0
      let totalExpenses = 0
      let totalOrders = 0
      const byAssignee = new Map<string, number>()

      for (const ls of livestreams) {
        totalIncome += (ls.totalIncome ?? 0) as number
        totalExpenses += (ls.ads ?? 0) as number
        totalOrders += (ls.totalOrders ?? 0) as number

        const snapshots = (ls.snapshots ?? []) as LivestreamSnapshotEmbedded[]
        for (const s of snapshots) {
          if (!s) continue
          const income = s.income ?? 0
          if (s.assignee) {
            const assigneeId = (s.assignee as Types.ObjectId).toString()
            byAssignee.set(
              assigneeId,
              (byAssignee.get(assigneeId) ?? 0) + income
            )
          }
        }
      }

      const incomeByAssignee = Array.from(byAssignee.entries()).map(
        ([assigneeId, income]) => ({
          assigneeId,
          income
        })
      )

      return { totalIncome, totalExpenses, totalOrders, incomeByAssignee }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Get aggregated metrics for livestreams in a date range
  async getAggregatedMetrics(
    startDate: Date,
    endDate: Date,
    channelId?: string,
    forRole?: "host" | "assistant",
    assigneeId?: string
  ): Promise<{
    totalIncome: number
    totalAdsCost: number
    totalComments: number
    totalOrders: number
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .exec()

      let totalIncome = 0
      let totalAdsCost = 0
      let totalComments = 0
      let totalOrders = 0

      for (const livestream of livestreams) {
        const snapshots = livestream.snapshots as LivestreamSnapshotEmbedded[]

        for (const snapshot of snapshots) {
          // Apply filters to snapshots
          if (channelId && snapshot.period?.channel.toString() !== channelId)
            continue
          if (forRole && snapshot.period?.for !== forRole) continue
          if (assigneeId && snapshot.assignee?.toString() !== assigneeId)
            continue

          totalIncome += snapshot.income ?? 0
          totalAdsCost += snapshot.adsCost ?? 0
          totalComments += snapshot.comments ?? 0
          totalOrders += snapshot.orders ?? 0
        }
      }

      return {
        totalIncome,
        totalAdsCost,
        totalComments,
        totalOrders
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Get hosts ranked by revenue in date range
  async getHostRevenueRankings(
    startDate: Date,
    endDate: Date
  ): Promise<{
    rankings: Array<{
      hostId: string | "other"
      hostName: string
      totalRevenue: number
      totalAdsCost: number
      totalOrders: number
    }>
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new HttpException("Invalid date range", HttpStatus.BAD_REQUEST)
      }

      // Get all livestreams in date range
      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .populate("snapshots.assignee", "_id name username")
        .populate("snapshots.altAssignee", "_id name username")
        .exec()

      // Map to store aggregated data per host
      const hostDataMap = new Map<
        string,
        {
          hostId: string | "other"
          hostName: string
          totalRevenue: number
          totalAdsCost: number
          totalOrders: number
        }
      >()

      for (const livestream of livestreams) {
        const snapshots = livestream.snapshots as LivestreamSnapshotEmbedded[]

        for (const snapshot of snapshots) {
          const income = snapshot.income ?? 0
          const adsCost = snapshot.adsCost ?? 0

          let targetHostId: string | "other"
          let targetHostName: string

          // Determine which host to attribute the revenue to
          if (snapshot.altAssignee) {
            // Case: altAssignee exists
            if (snapshot.altAssignee === "other") {
              // Alt is "other"
              targetHostId = "other"
              targetHostName = "Other"
            } else {
              // Alt is a user
              const altUser = snapshot.altAssignee as any
              targetHostId = altUser._id?.toString() || altUser.toString()
              targetHostName = altUser.name || altUser.username || "Unknown"
            }
          } else if (snapshot.assignee) {
            // Case: No alt, use assignee
            const assigneeUser = snapshot.assignee as any
            targetHostId =
              assigneeUser._id?.toString() || assigneeUser.toString()
            targetHostName =
              assigneeUser.name || assigneeUser.username || "Unknown"
          } else {
            // Case: No assignee at all, skip
            continue
          }

          // Get or create entry in map
          if (!hostDataMap.has(targetHostId)) {
            hostDataMap.set(targetHostId, {
              hostId: targetHostId,
              hostName: targetHostName,
              totalRevenue: 0,
              totalAdsCost: 0,
              totalOrders: 0
            })
          }

          const hostData = hostDataMap.get(targetHostId)!
          hostData.totalRevenue += income
          hostData.totalAdsCost += adsCost
        }

        // Add orders to all hosts who have snapshots in this livestream
        const totalOrders = livestream.totalOrders ?? 0

        // Get unique hosts in this livestream
        const hostsInLivestream = new Set<string>()
        for (const snapshot of snapshots) {
          if (snapshot.altAssignee) {
            if (snapshot.altAssignee === "other") {
              hostsInLivestream.add("other")
            } else {
              const altUser = snapshot.altAssignee as any
              const altId = altUser._id?.toString() || altUser.toString()
              hostsInLivestream.add(altId)
            }
          } else if (snapshot.assignee) {
            const assigneeUser = snapshot.assignee as any
            const assigneeId =
              assigneeUser._id?.toString() || assigneeUser.toString()
            hostsInLivestream.add(assigneeId)
          }
        }

        // Distribute orders equally among hosts in this livestream
        const ordersPerHost =
          hostsInLivestream.size > 0 ? totalOrders / hostsInLivestream.size : 0

        for (const hostId of hostsInLivestream) {
          if (hostDataMap.has(hostId)) {
            hostDataMap.get(hostId)!.totalOrders += ordersPerHost
          }
        }
      }

      // Convert map to array and sort by revenue (descending)
      const rankings = Array.from(hostDataMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue
      )

      return { rankings }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Get assistants ranked by revenue in date range
  async getAssistantRevenueRankings(
    startDate: Date,
    endDate: Date
  ): Promise<{
    rankings: Array<{
      assistantId: string | "other"
      assistantName: string
      totalRevenue: number
      totalAdsCost: number
      totalOrders: number
    }>
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new HttpException("Invalid date range", HttpStatus.BAD_REQUEST)
      }

      // Get all livestreams in date range
      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .populate("snapshots.assignee", "_id name username")
        .populate("snapshots.altAssignee", "_id name username")
        .exec()

      // Map to store aggregated data per assistant
      const assistantDataMap = new Map<
        string,
        {
          assistantId: string | "other"
          assistantName: string
          totalRevenue: number
          totalAdsCost: number
          totalOrders: number
        }
      >()

      for (const livestream of livestreams) {
        const snapshots = livestream.snapshots as LivestreamSnapshotEmbedded[]

        for (const snapshot of snapshots) {
          // Only process assistant snapshots
          if ((snapshot as any).period?.for !== "assistant") {
            continue
          }

          const income = snapshot.income ?? 0
          const adsCost = snapshot.adsCost ?? 0

          let targetAssistantId: string | "other"
          let targetAssistantName: string

          // Determine which assistant to attribute the revenue to
          if (snapshot.altAssignee) {
            // Case: altAssignee exists
            if (snapshot.altAssignee === "other") {
              // Alt is "other"
              targetAssistantId = "other"
              targetAssistantName = "Other"
            } else {
              // Alt is a user
              const altUser = snapshot.altAssignee as any
              targetAssistantId = altUser._id?.toString() || altUser.toString()
              targetAssistantName =
                altUser.name || altUser.username || "Unknown"
            }
          } else if (snapshot.assignee) {
            // Case: No alt, use assignee
            const assigneeUser = snapshot.assignee as any
            targetAssistantId =
              assigneeUser._id?.toString() || assigneeUser.toString()
            targetAssistantName =
              assigneeUser.name || assigneeUser.username || "Unknown"
          } else {
            // Case: No assignee at all, skip
            continue
          }

          // Get or create entry in map
          if (!assistantDataMap.has(targetAssistantId)) {
            assistantDataMap.set(targetAssistantId, {
              assistantId: targetAssistantId,
              assistantName: targetAssistantName,
              totalRevenue: 0,
              totalAdsCost: 0,
              totalOrders: 0
            })
          }

          const assistantData = assistantDataMap.get(targetAssistantId)!
          assistantData.totalRevenue += income
          assistantData.totalAdsCost += adsCost
        }

        // Add orders to all assistants who have snapshots in this livestream
        const totalOrders = livestream.totalOrders ?? 0

        // Get unique assistants in this livestream (only assistant snapshots)
        const assistantsInLivestream = new Set<string>()
        for (const snapshot of snapshots) {
          if ((snapshot as any).period?.for !== "assistant") {
            continue
          }

          if (snapshot.altAssignee) {
            if (snapshot.altAssignee === "other") {
              assistantsInLivestream.add("other")
            } else {
              const altUser = snapshot.altAssignee as any
              const altId = altUser._id?.toString() || altUser.toString()
              assistantsInLivestream.add(altId)
            }
          } else if (snapshot.assignee) {
            const assigneeUser = snapshot.assignee as any
            const assigneeId =
              assigneeUser._id?.toString() || assigneeUser.toString()
            assistantsInLivestream.add(assigneeId)
          }
        }

        // Distribute orders equally among assistants in this livestream
        const ordersPerAssistant =
          assistantsInLivestream.size > 0
            ? totalOrders / assistantsInLivestream.size
            : 0

        for (const assistantId of assistantsInLivestream) {
          if (assistantDataMap.has(assistantId)) {
            assistantDataMap.get(assistantId)!.totalOrders += ordersPerAssistant
          }
        }
      }

      // Convert map to array and sort by revenue (descending)
      const rankings = Array.from(assistantDataMap.values()).sort(
        (a, b) => b.totalRevenue - a.totalRevenue
      )

      return { rankings }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
