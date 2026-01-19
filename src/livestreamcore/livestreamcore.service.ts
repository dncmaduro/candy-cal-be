import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types, HydratedDocument } from "mongoose"
import {
  Livestream,
  LivestreamSnapshotEmbedded
} from "../database/mongoose/schemas/Livestream"
import { LivestreamPeriod } from "../database/mongoose/schemas/LivestreamPeriod"
import { LivestreamMonthGoal } from "../database/mongoose/schemas/LivestreamGoal"
import { User } from "../database/mongoose/schemas/User"

type LivestreamDoc = HydratedDocument<Livestream>

@Injectable()
export class LivestreamcoreService {
  constructor(
    @InjectModel("livestreams")
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel("livestreamperiods")
    private readonly livestreamPeriodModel: Model<LivestreamPeriod>,
    @InjectModel("livestreammonthgoals")
    private readonly livestreamMonthGoalModel: Model<LivestreamMonthGoal>,
    @InjectModel("users")
    private readonly userModel: Model<User>
  ) {}

  // helper: convert time to minutes since midnight
  private timeToMinutes(t: { hour: number; minute: number }): number {
    return (t.hour || 0) * 60 + (t.minute || 0)
  }

  // helper: intervals overlap (end is exclusive)
  private intervalsOverlap(
    startA: { hour: number; minute: number },
    endA: { hour: number; minute: number },
    startB: { hour: number; minute: number },
    endB: { hour: number; minute: number }
  ): boolean {
    const aStart = this.timeToMinutes(startA)
    const aEnd = this.timeToMinutes(endA)
    const bStart = this.timeToMinutes(startB)
    const bEnd = this.timeToMinutes(endB)
    return aStart < bEnd && bStart < aEnd
  }

  // helper: compute totalIncome from snapshots (sum of snapshot.income)
  private computeTotalIncome(snapshots?: LivestreamSnapshotEmbedded[]): number {
    if (!snapshots || snapshots.length === 0) return 0
    return snapshots.reduce((sum, s) => sum + (s.income ?? 0), 0)
  }

  // helper: check if time range A contains time range B
  private timeRangeContains(
    aStart: { hour: number; minute: number },
    aEnd: { hour: number; minute: number },
    bStart: { hour: number; minute: number },
    bEnd: { hour: number; minute: number }
  ): boolean {
    const aStartMin = this.timeToMinutes(aStart)
    const aEndMin = this.timeToMinutes(aEnd)
    const bStartMin = this.timeToMinutes(bStart)
    const bEndMin = this.timeToMinutes(bEnd)
    return aStartMin <= bStartMin && aEndMin >= bEndMin
  }

  // helper: find assistant snapshots that are contained by the host snapshot time range
  private findCorrespondingAssistantSnapshots(
    snapshots: LivestreamSnapshotEmbedded[],
    hostSnapshot: LivestreamSnapshotEmbedded
  ): LivestreamSnapshotEmbedded[] {
    if (!hostSnapshot.period) return []

    const hostStart = hostSnapshot.period.startTime
    const hostEnd = hostSnapshot.period.endTime

    return snapshots.filter((s) => {
      if (!s.period || s.period.for !== "assistant") return false

      return this.timeRangeContains(
        hostStart,
        hostEnd,
        s.period.startTime,
        s.period.endTime
      )
    })
  }

  // helper: validate user exists
  private async validateUserExists(userId: string): Promise<void> {
    const user = await this.userModel.findById(userId).exec()
    if (!user) {
      throw new HttpException("User not found", HttpStatus.NOT_FOUND)
    }
  }

  // Get all period IDs for a specific channel
  async getPeriodIdsByChannel(channelId: string): Promise<string[]> {
    try {
      const periods = await this.livestreamPeriodModel
        .find({ channel: channelId })
        .select("_id")
        .exec()
      return periods.map((p) => p._id.toString())
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Create a new livestream, date must be unique (by day)
  async createLivestream(payload: {
    date: Date
    totalOrders?: number
    totalIncome?: number
    ads?: number
    snapshots?: string[] // period ids
  }): Promise<Livestream> {
    try {
      // 1) Normalize date to start-of-day (local server timezone)
      const rawDate = new Date(payload.date)
      if (isNaN(rawDate.getTime())) {
        throw new HttpException("Invalid date", HttpStatus.BAD_REQUEST)
      }

      const start = new Date(rawDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)

      // 2) Base object
      const createdObj: any = {
        date: start,
        snapshots: [],
        totalOrders: payload.totalOrders ?? 0,
        totalIncome: 0,
        ads: payload.ads ?? 0,
        dateKpi: 0
      }

      // ---- No snapshots => create livestream with dateKpi = 0
      if (!Array.isArray(payload.snapshots) || payload.snapshots.length === 0) {
        const created = new this.livestreamModel(createdObj)
        return await created.save()
      }

      // 3) Load periods
      const periods = await this.livestreamPeriodModel
        .find({ _id: { $in: payload.snapshots } })
        .exec()

      if (!periods || periods.length === 0) {
        throw new HttpException(
          "No valid periods found",
          HttpStatus.BAD_REQUEST
        )
      }

      // 4) Determine channelId from first period
      const firstChannel = periods[0].channel
      const channelObjectId: Types.ObjectId = firstChannel?._id
        ? new Types.ObjectId(firstChannel._id)
        : new Types.ObjectId(firstChannel)

      const channelIdString = channelObjectId.toString()

      // 5) Check uniqueness by date + channel
      // Find all livestreams on this date and check if any has the same channel
      const existingLivestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lt: end } })
        .exec()

      for (const existing of existingLivestreams) {
        const existingSnapshots =
          existing.snapshots as LivestreamSnapshotEmbedded[]
        if (existingSnapshots.length > 0 && existingSnapshots[0].period) {
          const existingChannel = existingSnapshots[0].period.channel.toString()
          if (existingChannel === channelObjectId.toString()) {
            throw new HttpException(
              "Livestream for this date and channel already exists",
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }

      // 6) Calculate dateKpi from month goal
      const month = start.getMonth() + 1
      const year = start.getFullYear()

      const monthGoal = await this.livestreamMonthGoalModel
        .findOne({ month, year, channel: channelObjectId })
        .exec()

      let dateKpi = 0
      if (monthGoal) {
        const daysInMonth = new Date(year, month, 0).getDate()
        dateKpi = Math.round((monthGoal.goal ?? 0) / daysInMonth / 1000) * 1000
      }
      createdObj.dateKpi = dateKpi

      // 7) snapshotKpi = dateKpi / number of snapshots
      const snapshotKpi =
        periods.length > 0
          ? Math.round(dateKpi / periods.length / 1000) * 1000
          : 0

      // 8) Map embedded snapshots
      createdObj.snapshots = periods.map((p) => {
        const pChannel: any = (p as any).channel
        const pChannelId = pChannel?._id
          ? pChannel._id.toString()
          : pChannel.toString()

        return {
          period: {
            _id: p._id as Types.ObjectId,
            startTime: p.startTime,
            endTime: p.endTime,
            channel: pChannelId,
            for: p.for
          },
          goal: 0,
          income: 0,
          snapshotKpi
        }
      })

      // 9) Recompute totalIncome
      createdObj.totalIncome = this.computeTotalIncome(createdObj.snapshots)

      // 10) Save
      const created = new this.livestreamModel(createdObj)
      return await created.save()
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Get livestreams in a date range
  async getLivestreamsByDateRange(
    startDate: Date,
    endDate: Date,
    channel?: string,
    forRole?: "host" | "assistant",
    assigneeId?: string
  ): Promise<{ livestreams: Livestream[] }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .sort({ date: 1 })
        .populate("snapshots.assignee", "_id name username avatarUrl")
        .exec()

      let filtered = livestreams

      if (channel || forRole || assigneeId) {
        filtered = livestreams.filter((ls) => {
          const snapshots = ls.snapshots as LivestreamSnapshotEmbedded[]
          return snapshots.some((s) => {
            if (!s.period) return false

            const channelMatch = channel
              ? s.period.channel.toString() === channel
              : true
            const roleMatch = forRole ? s.period.for === forRole : true
            const assigneeMatch = assigneeId
              ? s.assignee?.toString() === assigneeId
              : true

            return channelMatch && roleMatch && assigneeMatch
          })
        })
      }

      return { livestreams: filtered }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Add a snapshot to existing livestream
  async addSnapshotToLivestream(
    livestreamId: string,
    payload: {
      period: string
      assignee?: string
      goal: number
      income?: number
    }
  ): Promise<Livestream> {
    try {
      if (payload.assignee) {
        await this.validateUserExists(payload.assignee)
      }

      const livestreamDoc = await this.livestreamModel
        .findById(livestreamId)
        .exec()
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      const newPeriodDoc = await this.livestreamPeriodModel
        .findById(payload.period)
        .exec()
      if (!newPeriodDoc)
        throw new HttpException("Period not found", HttpStatus.BAD_REQUEST)
      const newPeriodTyped = newPeriodDoc as LivestreamPeriod
      const newStart = newPeriodTyped.startTime
      const newEnd = newPeriodTyped.endTime

      // Check channel consistency
      const existingChannels = new Set<string>()
      for (const s of livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]) {
        if (s.period && s.period.channel)
          existingChannels.add(s.period.channel.toString())
      }
      if (existingChannels.size > 0) {
        const only = Array.from(existingChannels)[0]
        const newChannelId = (
          newPeriodTyped.channel as Types.ObjectId
        ).toString()
        if (only !== newChannelId) {
          throw new HttpException(
            "Snapshots in one livestream must belong to the same channel",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // Check time overlap
      for (const s of livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]) {
        const p = s.period as LivestreamSnapshotEmbedded["period"]
        if (!p || !p.startTime || !p.endTime) continue
        if (p.for === newPeriodTyped.for) {
          if (this.intervalsOverlap(p.startTime, p.endTime, newStart, newEnd)) {
            throw new HttpException(
              `Snapshot period overlaps with existing ${newPeriodTyped.for} snapshot period`,
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }

      const newSnapshot: LivestreamSnapshotEmbedded = {
        period: {
          _id: newPeriodTyped._id as Types.ObjectId,
          startTime: newPeriodTyped.startTime,
          endTime: newPeriodTyped.endTime,
          channel: newPeriodTyped.channel,
          for: newPeriodTyped.for
        },
        assignee: payload.assignee
          ? new Types.ObjectId(payload.assignee)
          : undefined,
        income: payload.income ?? 0
      }
      livestreamDoc.snapshots.push(newSnapshot as LivestreamSnapshotEmbedded)

      livestreamDoc.totalOrders = livestreamDoc.totalOrders ?? 0
      livestreamDoc.ads = livestreamDoc.ads ?? 0
      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      await livestreamDoc.populate(
        "snapshots.assignee",
        "_id name username avatarUrl"
      )
      return livestreamDoc
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Update a snapshot inside a livestream
  async updateSnapshot(
    livestreamId: string,
    snapshotId: string,
    payload: {
      period?: string
      assignee?: string
      goal?: number
      income?: number
    }
  ): Promise<Livestream> {
    try {
      if (payload.assignee) {
        await this.validateUserExists(payload.assignee)
      }

      const livestreamDoc = (await this.livestreamModel
        .findById(livestreamId)
        .exec()) as LivestreamDoc
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      if (livestreamDoc.fixed) {
        throw new HttpException(
          "Cannot update snapshot: Livestream is fixed",
          HttpStatus.BAD_REQUEST
        )
      }

      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const snapshot = snapshotsArray.find(
        (s) => s._id?.toString() === snapshotId
      )
      if (!snapshot)
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)

      const newPeriodId = payload.period
        ? payload.period
        : (
            snapshot.period as LivestreamSnapshotEmbedded["period"]
          )?._id?.toString()

      const newPeriodDoc = await this.livestreamPeriodModel
        .findById(newPeriodId)
        .exec()
      if (!newPeriodDoc)
        throw new HttpException("Period not found", HttpStatus.BAD_REQUEST)
      const newPeriodTyped = newPeriodDoc as LivestreamPeriod
      const newStart = newPeriodTyped.startTime
      const newEnd = newPeriodTyped.endTime

      const otherSnapshots = (
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      ).filter((s) => s._id?.toString() !== snapshotId)

      // Check channel consistency
      const existingChannels = new Set<string>()
      for (const s of otherSnapshots) {
        if (s.period && s.period.channel)
          existingChannels.add(s.period.channel.toString())
      }
      if (existingChannels.size > 0) {
        const only = Array.from(existingChannels)[0]
        const newChannelId = (
          newPeriodTyped.channel as Types.ObjectId
        ).toString()
        if (only !== newChannelId) {
          throw new HttpException(
            "Snapshots in one livestream must belong to the same channel",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // Check overlap
      for (const s of otherSnapshots) {
        const p = s.period as LivestreamSnapshotEmbedded["period"]
        if (!p || !p.startTime || !p.endTime) continue
        if (p.for === newPeriodTyped.for) {
          if (this.intervalsOverlap(p.startTime, p.endTime, newStart, newEnd)) {
            throw new HttpException(
              `Snapshot period overlaps with existing ${newPeriodTyped.for} snapshot period`,
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }

      if (payload.period)
        snapshot.period = {
          _id: newPeriodTyped._id as Types.ObjectId,
          startTime: newPeriodTyped.startTime,
          endTime: newPeriodTyped.endTime,
          channel: newPeriodTyped.channel,
          for: newPeriodTyped.for
        }
      if (payload.assignee)
        snapshot.assignee = new Types.ObjectId(payload.assignee)
      else {
        snapshot.assignee = null
      }

      // Track income changes for HOST snapshots
      let incomeChange = 0
      let realIncomeChange = 0
      let adsCostChange = 0
      let ordersChange = 0
      let commentsChange = 0
      const isHostSnapshot = snapshot.period?.for === "host"

      if (isHostSnapshot) {
        if (typeof payload.income !== "undefined") {
          const oldIncome = snapshot.income ?? 0
          incomeChange = payload.income - oldIncome
          snapshot.income = payload.income
        }

        // Check if realIncome is being updated (even though not in current payload interface)
        if (typeof (payload as any).realIncome !== "undefined") {
          const oldRealIncome = snapshot.realIncome ?? 0
          realIncomeChange = (payload as any).realIncome - oldRealIncome
          snapshot.realIncome = (payload as any).realIncome
        }

        // Check if adsCost is being updated
        if (typeof (payload as any).adsCost !== "undefined") {
          const oldAdsCost = snapshot.adsCost ?? 0
          adsCostChange = (payload as any).adsCost - oldAdsCost
          snapshot.adsCost = (payload as any).adsCost
        }

        // Check if orders is being updated
        if (typeof (payload as any).orders !== "undefined") {
          const oldOrders = snapshot.orders ?? 0
          ordersChange = (payload as any).orders - oldOrders
          snapshot.orders = (payload as any).orders
        }

        // Check if comments is being updated
        if (typeof (payload as any).comments !== "undefined") {
          const oldComments = snapshot.comments ?? 0
          commentsChange = (payload as any).comments - oldComments
          snapshot.comments = (payload as any).comments
        }

        // Update corresponding assistant snapshots
        if (
          incomeChange !== 0 ||
          realIncomeChange !== 0 ||
          adsCostChange !== 0 ||
          ordersChange !== 0 ||
          commentsChange !== 0
        ) {
          const assistantSnapshots = this.findCorrespondingAssistantSnapshots(
            livestreamDoc.snapshots as LivestreamSnapshotEmbedded[],
            snapshot
          )

          for (const assistantSnapshot of assistantSnapshots) {
            if (incomeChange !== 0) {
              assistantSnapshot.income =
                (assistantSnapshot.income ?? 0) + incomeChange
            }
            if (realIncomeChange !== 0) {
              assistantSnapshot.realIncome =
                (assistantSnapshot.realIncome ?? 0) + realIncomeChange
            }
            if (adsCostChange !== 0) {
              assistantSnapshot.adsCost =
                (assistantSnapshot.adsCost ?? 0) + adsCostChange
            }
            if (ordersChange !== 0) {
              assistantSnapshot.orders =
                (assistantSnapshot.orders ?? 0) + ordersChange
            }
            if (commentsChange !== 0) {
              assistantSnapshot.comments =
                (assistantSnapshot.comments ?? 0) + commentsChange
            }
          }
        }
      } else {
        // Not a host snapshot, update normally
        if (typeof payload.income !== "undefined") {
          snapshot.income = payload.income
        }
        if (typeof (payload as any).realIncome !== "undefined") {
          snapshot.realIncome = (payload as any).realIncome
        }
        if (typeof (payload as any).adsCost !== "undefined") {
          snapshot.adsCost = (payload as any).adsCost
        }
        if (typeof (payload as any).orders !== "undefined") {
          snapshot.orders = (payload as any).orders
        }
        if (typeof (payload as any).comments !== "undefined") {
          snapshot.comments = (payload as any).comments
        }
      }

      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      await livestreamDoc.populate(
        "snapshots.assignee",
        "_id name username avatarUrl"
      )
      return livestreamDoc
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Report snapshot metrics
  async reportSnapshot(
    livestreamId: string,
    snapshotId: string,
    payload: {
      income: number
      adsCost: number
      clickRate: number
      avgViewingDuration: number
      comments: number
      orders: number
      ordersNote: string
      rating?: string
    }
  ): Promise<Livestream> {
    try {
      const livestreamDoc = (await this.livestreamModel
        .findById(livestreamId)
        .exec()) as LivestreamDoc
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const snapshot = snapshotsArray.find(
        (s) => s._id?.toString() === snapshotId
      )
      if (!snapshot)
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)

      // Track changes for HOST snapshots
      const isHostSnapshot = snapshot.period?.for === "host"
      let incomeChange = 0
      let adsCostChange = 0
      let ordersChange = 0
      let commentsChange = 0

      if (isHostSnapshot) {
        const oldIncome = snapshot.income ?? 0
        const oldAdsCost = snapshot.adsCost ?? 0
        const oldOrders = snapshot.orders ?? 0
        const oldComments = snapshot.comments ?? 0

        incomeChange = payload.income - oldIncome
        adsCostChange = payload.adsCost - oldAdsCost
        ordersChange = payload.orders - oldOrders
        commentsChange = payload.comments - oldComments
      }

      snapshot.income = payload.income
      snapshot.adsCost = payload.adsCost
      snapshot.clickRate = payload.clickRate
      snapshot.avgViewingDuration = payload.avgViewingDuration
      snapshot.comments = payload.comments
      snapshot.orders = payload.orders
      snapshot.ordersNote = payload.ordersNote
      if (typeof payload.rating !== "undefined") {
        snapshot.rating = payload.rating
      }

      // Update corresponding assistant snapshots if this is a host snapshot
      if (
        isHostSnapshot &&
        (incomeChange !== 0 ||
          adsCostChange !== 0 ||
          ordersChange !== 0 ||
          commentsChange !== 0)
      ) {
        const assistantSnapshots = this.findCorrespondingAssistantSnapshots(
          livestreamDoc.snapshots as LivestreamSnapshotEmbedded[],
          snapshot
        )

        for (const assistantSnapshot of assistantSnapshots) {
          if (incomeChange !== 0) {
            assistantSnapshot.income =
              (assistantSnapshot.income ?? 0) + incomeChange
          }
          if (adsCostChange !== 0) {
            assistantSnapshot.adsCost =
              (assistantSnapshot.adsCost ?? 0) + adsCostChange
          }
          if (ordersChange !== 0) {
            assistantSnapshot.orders =
              (assistantSnapshot.orders ?? 0) + ordersChange
          }
          if (commentsChange !== 0) {
            assistantSnapshot.comments =
              (assistantSnapshot.comments ?? 0) + commentsChange
          }
        }
      }

      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      await livestreamDoc.populate(
        "snapshots.assignee",
        "_id name username avatarUrl"
      )
      return livestreamDoc
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Delete a snapshot from livestream
  async deleteSnapshot(
    livestreamId: string,
    snapshotId: string
  ): Promise<void> {
    try {
      const livestreamDoc = (await this.livestreamModel
        .findById(livestreamId)
        .exec()) as LivestreamDoc
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const idx = snapshotsArray.findIndex(
        (s) => s._id?.toString() === snapshotId
      )
      if (idx === -1)
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)

      livestreamDoc.snapshots = snapshotsArray.filter(
        (s) => s._id?.toString() !== snapshotId
      )

      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      return
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Set livestream metrics
  async setLivestreamMetrics(
    livestreamId: string,
    payload: { totalOrders?: number; totalIncome?: number; ads?: number }
  ): Promise<Livestream> {
    try {
      const update: {
        totalOrders?: number
        ads?: number
      } = {}
      if (typeof payload.totalOrders !== "undefined")
        update.totalOrders = payload.totalOrders
      if (typeof payload.ads !== "undefined") update.ads = payload.ads

      const updated = await this.livestreamModel
        .findByIdAndUpdate(livestreamId, { $set: update }, { new: true })
        .exec()
      if (!updated)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)
      return updated
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Sync snapshots of livestreams
  async syncSnapshots(
    startDate: Date,
    endDate: Date,
    channelId: string
  ): Promise<{ updated: number; message: string }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const currentPeriods = await this.livestreamPeriodModel
        .find({ channel: channelId })
        .exec()

      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .exec()

      let updatedCount = 0

      for (const livestream of livestreams) {
        const livestreamDoc = livestream as LivestreamDoc

        if (livestreamDoc.fixed) {
          continue
        }

        const snapshots =
          livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]

        const channelSnapshots = snapshots.filter(
          (s) => s.period && s.period.channel.toString() === channelId
        )

        const existingSnapshotsMap = new Map<
          string,
          LivestreamSnapshotEmbedded
        >()
        for (const snapshot of channelSnapshots) {
          if (snapshot.period?._id) {
            existingSnapshotsMap.set(snapshot.period._id.toString(), snapshot)
          }
        }

        const currentPeriodIds = new Set(
          currentPeriods.map((p) => p._id.toString())
        )

        const newSnapshots: LivestreamSnapshotEmbedded[] = []

        for (const snapshot of snapshots) {
          if (
            snapshot.period &&
            snapshot.period.channel.toString() !== channelId
          ) {
            newSnapshots.push(snapshot)
          }
        }

        const livestreamDate = new Date(livestreamDoc.date)
        const month = livestreamDate.getMonth() + 1
        const year = livestreamDate.getFullYear()

        const monthGoal = await this.livestreamMonthGoalModel
          .findOne({ month, year, channel: channelId })
          .exec()

        let dateKpi = 0
        if (monthGoal) {
          const daysInMonth = new Date(year, month, 0).getDate()
          dateKpi = Math.round(monthGoal.goal / daysInMonth / 1000) * 1000
          livestreamDoc.dateKpi = dateKpi
        }

        const snapshotKpi =
          currentPeriods.length > 0
            ? Math.round(dateKpi / currentPeriods.length / 1000) * 1000
            : 0

        for (const period of currentPeriods as LivestreamPeriod[]) {
          const periodId = period._id.toString()
          const existingSnapshot = existingSnapshotsMap.get(periodId)

          if (existingSnapshot) {
            newSnapshots.push({
              _id: existingSnapshot._id,
              period: {
                _id: period._id as Types.ObjectId,
                startTime: period.startTime,
                endTime: period.endTime,
                channel: period.channel,
                for: period.for
              },
              assignee: existingSnapshot.assignee,
              income: existingSnapshot.income ?? 0,
              snapshotKpi: snapshotKpi
            })
          } else {
            newSnapshots.push({
              period: {
                _id: period._id as Types.ObjectId,
                startTime: period.startTime,
                endTime: period.endTime,
                channel: period.channel,
                for: period.for
              },
              assignee: undefined,
              income: 0,
              snapshotKpi: snapshotKpi
            })
          }
        }

        let snapshotsChanged = newSnapshots.length !== snapshots.length

        if (!snapshotsChanged) {
          for (let i = 0; i < newSnapshots.length; i++) {
            const newSnap = newSnapshots[i]
            const oldSnap = snapshots[i]

            if (
              newSnap.period?._id?.toString() !==
                oldSnap.period?._id?.toString() ||
              newSnap.period?.for !== oldSnap.period?.for ||
              newSnap.period?.startTime?.hour !==
                oldSnap.period?.startTime?.hour ||
              newSnap.period?.startTime?.minute !==
                oldSnap.period?.startTime?.minute ||
              newSnap.period?.endTime?.hour !== oldSnap.period?.endTime?.hour ||
              newSnap.period?.endTime?.minute !==
                oldSnap.period?.endTime?.minute
            ) {
              snapshotsChanged = true
              break
            }
          }
        }

        if (snapshotsChanged) {
          livestreamDoc.snapshots = newSnapshots
          livestreamDoc.totalIncome = this.computeTotalIncome(newSnapshots)
          await livestreamDoc.save()
          updatedCount++
        }
      }

      return {
        updated: updatedCount,
        message: `Successfully synced ${updatedCount} livestream(s)`
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

  // Fix livestreams
  async fixLivestreamByDate(
    startDate: Date,
    endDate: Date,
    channelId: string
  ): Promise<number> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .exec()

      let updated = 0

      for (const livestream of livestreams) {
        if (livestream.fixed) {
          continue
        }

        const snapshots = livestream.snapshots as LivestreamSnapshotEmbedded[]
        const hasChannelSnapshot = snapshots.some(
          (s) => s.period && s.period.channel.toString() === channelId
        )

        if (hasChannelSnapshot) {
          livestream.fixed = true
          await livestream.save()
          updated++
        }
      }

      return updated
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Update altAssignee and altNote for a snapshot
  async updateSnapshotAlt(
    livestreamId: string,
    snapshotId: string,
    payload: {
      altAssignee?: string | "other"
      altOtherAssignee?: string
      altNote?: string
    }
  ): Promise<Livestream> {
    try {
      const livestreamDoc = (await this.livestreamModel
        .findById(livestreamId)
        .exec()) as LivestreamDoc
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const snapshot = snapshotsArray.find(
        (s) => s._id?.toString() === snapshotId
      )
      if (!snapshot)
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)

      if (payload.altAssignee === undefined) {
        snapshot.altAssignee = undefined
        snapshot.altOtherAssignee = undefined
        snapshot.altNote = undefined
      } else {
        if (!payload.altNote || payload.altNote.trim() === "") {
          throw new HttpException(
            "altNote is required when altAssignee is provided",
            HttpStatus.BAD_REQUEST
          )
        }

        if (payload.altAssignee === "other") {
          snapshot.altAssignee = "other"
          snapshot.altOtherAssignee = payload.altOtherAssignee
          snapshot.altNote = payload.altNote
        } else {
          await this.validateUserExists(payload.altAssignee)

          const assigneeId = snapshot.assignee?.toString()
          if (assigneeId === payload.altAssignee) {
            throw new HttpException(
              "altAssignee must be different from assignee",
              HttpStatus.BAD_REQUEST
            )
          }

          snapshot.altAssignee = new Types.ObjectId(payload.altAssignee)
          snapshot.altNote = payload.altNote
        }
      }

      await livestreamDoc.save()
      await livestreamDoc.populate(
        "snapshots.assignee snapshots.altAssignee snapshots.altOtherAssignee",
        "_id name username avatarUrl"
      )
      return livestreamDoc
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Delete a livestream
  async deleteLivestream(id: string): Promise<void> {
    try {
      await this.livestreamModel.findByIdAndDelete(id).exec()
      return
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Create livestreams for a date range
  async createLivestreamRange(payload: {
    startDate: Date
    endDate: Date
    channel: string
    totalOrders?: number
    totalIncome?: number
    ads?: number
  }): Promise<Livestream[]> {
    try {
      const start = new Date(payload.startDate)
      const end = new Date(payload.endDate)
      start.setHours(0, 0, 0, 0)
      end.setHours(0, 0, 0, 0)

      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        throw new HttpException("Invalid date range", HttpStatus.BAD_REQUEST)
      }

      // Get all period IDs for this channel
      const periodIds = await this.getPeriodIdsByChannel(payload.channel)

      const created: Livestream[] = []
      // iterate inclusive
      for (
        let cur = new Date(start);
        cur.getTime() <= end.getTime();
        cur.setDate(cur.getDate() + 1)
      ) {
        try {
          const doc = await this.createLivestream({
            date: new Date(cur),
            totalOrders: payload.totalOrders,
            totalIncome: payload.totalIncome,
            ads: payload.ads,
            snapshots: periodIds
          })
          created.push(doc)
        } catch (err) {
          // if exists, skip; otherwise rethrow
          if (err instanceof HttpException) {
            const status = (err as HttpException).getStatus()
            if (status === HttpStatus.BAD_REQUEST) {
              // assume conflict for existing livestream; skip
              continue
            }
          }
          throw err
        }
      }

      return created
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Merge two snapshots of a livestream
  async mergeSnapshots(
    livestreamId: string,
    snapshotId1: string,
    snapshotId2: string
  ): Promise<{ livestream: Livestream }> {
    try {
      const livestreamDoc = (await this.livestreamModel
        .findById(livestreamId)
        .exec()) as LivestreamDoc
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const snapshot1Index = snapshotsArray.findIndex(
        (s) => s._id?.toString() === snapshotId1
      )
      const snapshot2Index = snapshotsArray.findIndex(
        (s) => s._id?.toString() === snapshotId2
      )

      if (snapshot1Index === -1 || snapshot2Index === -1)
        throw new HttpException(
          "One or both snapshots not found",
          HttpStatus.NOT_FOUND
        )

      const snapshot1 = snapshotsArray[snapshot1Index]
      const snapshot2 = snapshotsArray[snapshot2Index]

      // Validate snapshots can be merged
      // 1. Check if they don't have reporting metrics
      const reportingMetrics = [
        "income",
        "realIncome",
        "adsCost",
        "clickRate",
        "avgViewingDuration",
        "comments",
        "orders"
      ]

      for (const metric of reportingMetrics) {
        const val1 = (snapshot1 as any)[metric]
        const val2 = (snapshot2 as any)[metric]
        if (
          (val1 !== undefined && val1 !== null && val1 !== 0) ||
          (val2 !== undefined && val2 !== null && val2 !== 0)
        ) {
          throw new HttpException(
            `Cannot merge: Snapshots contain reporting metrics (${metric}). Both snapshots must be unreported.`,
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // 2. Check if endTime of snapshot1 = startTime of snapshot2
      const endTime1 = snapshot1.period?.endTime
      const startTime2 = snapshot2.period?.startTime

      if (!endTime1 || !startTime2) {
        throw new HttpException(
          "Snapshots must have valid time periods",
          HttpStatus.BAD_REQUEST
        )
      }

      if (
        endTime1.hour !== startTime2.hour ||
        endTime1.minute !== startTime2.minute
      ) {
        throw new HttpException(
          "Cannot merge: endTime of first snapshot must equal startTime of second snapshot",
          HttpStatus.BAD_REQUEST
        )
      }

      // 3. Determine the correct order (snapshot1 should be before snapshot2)
      let earlierSnapshot = snapshot1
      let laterSnapshot = snapshot2
      let earlierIndex = snapshot1Index
      let laterIndex = snapshot2Index

      // If snapshot2 is before snapshot1, swap them
      const startTime1Min = this.timeToMinutes(snapshot1.period!.startTime)
      const startTime2Min = this.timeToMinutes(snapshot2.period!.startTime)
      if (startTime2Min < startTime1Min) {
        earlierSnapshot = snapshot2
        laterSnapshot = snapshot1
        earlierIndex = snapshot2Index
        laterIndex = snapshot1Index
      }

      // Merge: create new snapshot with merged period and keep earlier assignee info
      const mergedSnapshot: LivestreamSnapshotEmbedded = {
        _id: earlierSnapshot._id,
        period: {
          _id: earlierSnapshot.period!._id,
          startTime: earlierSnapshot.period!.startTime,
          endTime: laterSnapshot.period!.endTime, // extend to later snapshot's end
          channel: earlierSnapshot.period!.channel,
          for: earlierSnapshot.period!.for
        },
        assignee: earlierSnapshot.assignee,
        altAssignee: earlierSnapshot.altAssignee,
        altOtherAssignee: earlierSnapshot.altOtherAssignee,
        // Keep other properties from earlier snapshot if not set
        income: earlierSnapshot.income ?? laterSnapshot.income,
        realIncome: earlierSnapshot.realIncome ?? laterSnapshot.realIncome,
        adsCost: earlierSnapshot.adsCost ?? laterSnapshot.adsCost,
        clickRate: earlierSnapshot.clickRate ?? laterSnapshot.clickRate,
        avgViewingDuration:
          earlierSnapshot.avgViewingDuration ??
          laterSnapshot.avgViewingDuration,
        comments: earlierSnapshot.comments ?? laterSnapshot.comments,
        ordersNote: earlierSnapshot.ordersNote ?? laterSnapshot.ordersNote,
        rating: earlierSnapshot.rating ?? laterSnapshot.rating,
        altNote: earlierSnapshot.altNote ?? laterSnapshot.altNote,
        altRequest: earlierSnapshot.altRequest ?? laterSnapshot.altRequest,
        snapshotKpi: earlierSnapshot.snapshotKpi ?? laterSnapshot.snapshotKpi,
        updatedByFileAt:
          earlierSnapshot.updatedByFileAt ?? laterSnapshot.updatedByFileAt,
        salary: earlierSnapshot.salary ?? laterSnapshot.salary,
        orders: earlierSnapshot.orders ?? laterSnapshot.orders
      }

      // Remove both old snapshots and add merged one
      const newSnapshots = snapshotsArray.filter(
        (s, idx) => idx !== earlierIndex && idx !== laterIndex
      )
      newSnapshots.push(mergedSnapshot)

      livestreamDoc.snapshots = newSnapshots
      livestreamDoc.totalIncome = this.computeTotalIncome(newSnapshots)

      await livestreamDoc.save()
      await livestreamDoc.populate(
        "snapshots.assignee",
        "_id name username avatarUrl"
      )
      return {
        livestream: livestreamDoc
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

  // Update startTime and endTime for multiple snapshots
  async updateSnapshotTimesForLivestream(
    livestreamId: string,
    payload: Array<{
      id: string
      startTime: { hour: number; minute: number }
      endTime: { hour: number; minute: number }
    }>
  ): Promise<{ livestream: Livestream }> {
    try {
      const livestreamDoc = (await this.livestreamModel
        .findById(livestreamId)
        .exec()) as LivestreamDoc
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      if (livestreamDoc.fixed) {
        throw new HttpException(
          "Cannot update snapshot times: Livestream is fixed",
          HttpStatus.BAD_REQUEST
        )
      }

      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]

      // First validate all snapshots exist and collect them
      const snapshotUpdates: Array<{
        snapshot: LivestreamSnapshotEmbedded
        index: number
        startTime: { hour: number; minute: number }
        endTime: { hour: number; minute: number }
      }> = []

      for (const update of payload) {
        const index = snapshotsArray.findIndex(
          (s) => s._id?.toString() === update.id
        )
        if (index === -1) {
          throw new HttpException(
            `Snapshot with id ${update.id} not found`,
            HttpStatus.NOT_FOUND
          )
        }

        // Validate startTime < endTime
        const startMin = this.timeToMinutes(update.startTime)
        const endMin = this.timeToMinutes(update.endTime)
        if (startMin >= endMin) {
          throw new HttpException(
            `Invalid time range for snapshot ${update.id}: startTime must be before endTime`,
            HttpStatus.BAD_REQUEST
          )
        }

        snapshotUpdates.push({
          snapshot: snapshotsArray[index],
          index,
          startTime: update.startTime,
          endTime: update.endTime
        })
      }

      // Check for overlaps: each snapshot's role ("host" or "assistant") should not overlap with others of the same role
      for (let i = 0; i < snapshotUpdates.length; i++) {
        const snapshotA = snapshotUpdates[i]
        const roleA = snapshotA.snapshot.period?.for

        for (let j = i + 1; j < snapshotUpdates.length; j++) {
          const snapshotB = snapshotUpdates[j]
          const roleB = snapshotB.snapshot.period?.for

          // Only check overlap if both are the same role
          if (roleA === roleB) {
            if (
              this.intervalsOverlap(
                snapshotA.startTime,
                snapshotA.endTime,
                snapshotB.startTime,
                snapshotB.endTime
              )
            ) {
              throw new HttpException(
                `Snapshots ${snapshotA.snapshot._id} and ${snapshotB.snapshot._id} have overlapping times for role "${roleA}"`,
                HttpStatus.BAD_REQUEST
              )
            }
          }
        }
      }

      // Also check overlap with snapshots not being updated
      for (const update of snapshotUpdates) {
        const updateRole = update.snapshot.period?.for

        for (const snapshot of snapshotsArray) {
          // Skip if this is one of the snapshots being updated
          if (payload.some((p) => p.id === snapshot._id?.toString())) {
            continue
          }

          const snapshotRole = snapshot.period?.for
          if (snapshotRole !== updateRole) {
            continue
          }

          const snapshotStart = snapshot.period?.startTime
          const snapshotEnd = snapshot.period?.endTime
          if (!snapshotStart || !snapshotEnd) {
            continue
          }

          if (
            this.intervalsOverlap(
              update.startTime,
              update.endTime,
              snapshotStart,
              snapshotEnd
            )
          ) {
            throw new HttpException(
              `Updated snapshot ${update.snapshot._id} overlaps with existing snapshot ${snapshot._id} for role "${updateRole}"`,
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }

      // All validations passed, update the snapshots
      for (const update of snapshotUpdates) {
        update.snapshot.period!.startTime = update.startTime
        update.snapshot.period!.endTime = update.endTime
      }

      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      await livestreamDoc.populate(
        "snapshots.assignee",
        "_id name username avatarUrl"
      )
      return {
        livestream: livestreamDoc
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
}
