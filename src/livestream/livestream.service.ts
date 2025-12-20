import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types, HydratedDocument } from "mongoose"
import { LivestreamPeriod } from "../database/mongoose/schemas/LivestreamPeriod"
import {
  Livestream,
  LivestreamSnapshotEmbedded
} from "../database/mongoose/schemas/Livestream"
import { LivestreamMonthGoal } from "../database/mongoose/schemas/LivestreamGoal"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"
import { LivestreamAltRequest } from "../database/mongoose/schemas/LivestreamAltRequest"
import { User } from "../database/mongoose/schemas/User"

type LivestreamDoc = HydratedDocument<Livestream>

@Injectable()
export class LivestreamService {
  constructor(
    @InjectModel("livestreamperiods")
    private readonly livestreamPeriodModel: Model<LivestreamPeriod>,
    @InjectModel("livestreammonthgoals")
    private readonly livestreamMonthGoalModel: Model<LivestreamMonthGoal>,
    @InjectModel("livestreams")
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>,
    @InjectModel("livestreamaltrequest")
    private readonly livestreamAltRequestModel: Model<LivestreamAltRequest>,
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

  // Create a new livestream period
  async createLivestreamPeriod(payload: {
    startTime: { hour: number; minute: number }
    endTime: { hour: number; minute: number }
    channel: string
    for: "host" | "assistant"
  }): Promise<LivestreamPeriod> {
    try {
      // validate interval
      const s = payload.startTime
      const e = payload.endTime
      if (this.timeToMinutes(s) >= this.timeToMinutes(e)) {
        throw new HttpException(
          "Period startTime must be before endTime",
          HttpStatus.BAD_REQUEST
        )
      }

      // check overlap within same channel and same role (host/assistant)
      const sameChannelAndRole = await this.livestreamPeriodModel
        .find({ channel: payload.channel, for: payload.for })
        .exec()

      for (const p of sameChannelAndRole as LivestreamPeriod[]) {
        if (
          this.intervalsOverlap(
            payload.startTime,
            payload.endTime,
            p.startTime as any,
            p.endTime as any
          )
        ) {
          throw new HttpException(
            `Period overlaps with existing ${payload.for} period on the same channel`,
            HttpStatus.BAD_REQUEST
          )
        }
      }

      const created = new this.livestreamPeriodModel({
        startTime: payload.startTime,
        endTime: payload.endTime,
        channel: new Types.ObjectId(payload.channel),
        for: payload.for
      })
      const saved = await created.save()
      // Populate channel before returning
      await saved.populate("channel", "_id name username link")
      return saved
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Retrieve all livestream periods
  async getAllLivestreamPeriods(): Promise<{ periods: LivestreamPeriod[] }> {
    try {
      const periods = await this.livestreamPeriodModel
        .find()
        .populate("channel", "_id name username link")
        .exec()
      return { periods }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Retrieve a single period by id
  async getLivestreamPeriodById(id: string): Promise<LivestreamPeriod> {
    try {
      const doc = await this.livestreamPeriodModel
        .findById(id)
        .populate("channel", "_id name username link")
        .exec()
      if (!doc)
        throw new HttpException(
          "Livestream period not found",
          HttpStatus.NOT_FOUND
        )
      return doc
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Update a livestream period
  async updateLivestreamPeriod(
    id: string,
    payload: {
      startTime?: { hour: number; minute: number }
      endTime?: { hour: number; minute: number }
      channel?: string
      for?: "host" | "assistant"
    }
  ): Promise<LivestreamPeriod> {
    try {
      const existing = await this.livestreamPeriodModel.findById(id).exec()
      if (!existing)
        throw new HttpException(
          "Livestream period not found",
          HttpStatus.NOT_FOUND
        )

      const newStart = payload.startTime ?? (existing as any).startTime
      const newEnd = payload.endTime ?? (existing as any).endTime
      if (this.timeToMinutes(newStart) >= this.timeToMinutes(newEnd)) {
        throw new HttpException(
          "Period startTime must be before endTime",
          HttpStatus.BAD_REQUEST
        )
      }

      const channelToCheck =
        payload.channel ?? (existing as any).channel.toString()
      const forRoleToCheck = payload.for ?? (existing as any).for

      // check overlap with other periods on same channel and same role
      const others = await this.livestreamPeriodModel
        .find({
          channel: channelToCheck,
          for: forRoleToCheck,
          _id: { $ne: id }
        })
        .exec()
      for (const p of others as LivestreamPeriod[]) {
        if (
          this.intervalsOverlap(
            newStart,
            newEnd,
            p.startTime as any,
            p.endTime as any
          )
        ) {
          throw new HttpException(
            `Updated period overlaps with existing ${forRoleToCheck} period on the same channel`,
            HttpStatus.BAD_REQUEST
          )
        }
      }

      const updateObj: any = {}
      if (typeof payload.startTime !== "undefined")
        updateObj.startTime = payload.startTime
      if (typeof payload.endTime !== "undefined")
        updateObj.endTime = payload.endTime
      if (typeof payload.channel !== "undefined")
        updateObj.channel = payload.channel
      if (typeof payload.for !== "undefined") updateObj.for = payload.for

      const updated = await this.livestreamPeriodModel
        .findByIdAndUpdate(id, { $set: updateObj }, { new: true })
        .populate("channel", "_id name username link")
        .exec()
      return updated as LivestreamPeriod
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Delete a livestream period (hard delete)
  async deleteLivestreamPeriod(id: string): Promise<void> {
    try {
      await this.livestreamPeriodModel.findByIdAndDelete(id).exec()
      return
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
    snapshots?: string[] // optional array of period ids to create default snapshots (no host/assistant)
  }): Promise<Livestream> {
    try {
      const date = new Date(payload.date)
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(start)
      end.setDate(end.getDate() + 1)

      const existing = await this.livestreamModel
        .findOne({ date: { $gte: start, $lt: end } })
        .exec()
      if (existing) {
        throw new HttpException(
          "Livestream for this date already exists",
          HttpStatus.BAD_REQUEST
        )
      }

      const createdObj: any = {
        date: start, // normalized to midnight of the day to ensure duplicate checks by day
        snapshots: [],
        totalOrders: payload.totalOrders ?? 0,
        totalIncome: 0,
        ads: payload.ads ?? 0
      }

      // if snapshots (period ids) provided, create embedded snapshots without assignee
      if (Array.isArray(payload.snapshots) && payload.snapshots.length > 0) {
        const periods = await this.livestreamPeriodModel
          .find({ _id: { $in: payload.snapshots } })
          .exec()
        // map and push snapshots (no assignee)
        createdObj.snapshots = periods.map((p) => {
          return {
            period: {
              _id: p._id as Types.ObjectId,
              startTime: p.startTime,
              endTime: p.endTime,
              channel: (p.channel as Types.ObjectId).toString(),
              for: p.for
            },
            goal: 0,
            income: 0
          }
        })
        createdObj.totalIncome = this.computeTotalIncome(createdObj.snapshots)
      }

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

  // Add a snapshot to existing livestream with conflict checks
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
      // Validate user exists
      if (payload.assignee) {
        await this.validateUserExists(payload.assignee)
      }

      const livestreamDoc = await this.livestreamModel
        .findById(livestreamId)
        .exec()
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      // fetch new period
      const newPeriodDoc = await this.livestreamPeriodModel
        .findById(payload.period)
        .exec()
      if (!newPeriodDoc)
        throw new HttpException("Period not found", HttpStatus.BAD_REQUEST)
      const newPeriodTyped = newPeriodDoc as LivestreamPeriod
      const newStart = newPeriodTyped.startTime
      const newEnd = newPeriodTyped.endTime

      // Check channel consistency: all snapshots must be from same channel
      const existingChannels = new Set<string>()
      for (const s of livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]) {
        if (s.period && s.period.channel) existingChannels.add(s.period.channel)
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

      // Check time overlap with existing embedded periods (same role only)
      for (const s of livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]) {
        const p = s.period as LivestreamSnapshotEmbedded["period"]
        if (!p || !p.startTime || !p.endTime) continue
        // Only check overlap if same role (host/assistant)
        if (p.for === newPeriodTyped.for) {
          if (this.intervalsOverlap(p.startTime, p.endTime, newStart, newEnd)) {
            throw new HttpException(
              `Snapshot period overlaps with existing ${newPeriodTyped.for} snapshot period`,
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }

      // push subdocument (typed) — store a snapshot of the period object
      const newSnapshot: LivestreamSnapshotEmbedded = {
        period: {
          _id: newPeriodTyped._id as Types.ObjectId,
          startTime: newPeriodTyped.startTime,
          endTime: newPeriodTyped.endTime,
          channel: (newPeriodTyped.channel as Types.ObjectId).toString(),
          for: newPeriodTyped.for
        },
        assignee: payload.assignee
          ? new Types.ObjectId(payload.assignee)
          : undefined,
        income: payload.income ?? 0
      }
      livestreamDoc.snapshots.push(newSnapshot as LivestreamSnapshotEmbedded)

      // update totals: totalOrders and ads keep existing or defaults,
      // totalIncome is computed from snapshot incomes
      livestreamDoc.totalOrders = livestreamDoc.totalOrders ?? 0
      livestreamDoc.ads = livestreamDoc.ads ?? 0
      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      // Populate user info before returning
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
      // Validate user exists if provided
      if (payload.assignee) {
        await this.validateUserExists(payload.assignee)
      }

      const livestreamDoc = (await this.livestreamModel
        .findById(livestreamId)
        .exec()) as LivestreamDoc
      if (!livestreamDoc)
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)

      // Check if livestream is fixed
      if (livestreamDoc.fixed) {
        throw new HttpException(
          "Cannot update snapshot: Livestream is fixed",
          HttpStatus.BAD_REQUEST
        )
      }

      // Access subdocument
      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const snapshot = snapshotsArray.find(
        (s) => s._id?.toString() === snapshotId
      )
      if (!snapshot)
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)

      // If period changed, re-run conflict checks
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

      // Load other snapshots (embedded periods available)
      const otherSnapshots = (
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      ).filter((s) => s._id?.toString() !== snapshotId)

      // Check channel consistency
      const existingChannels = new Set<string>()
      for (const s of otherSnapshots) {
        if (s.period && s.period.channel) existingChannels.add(s.period.channel)
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

      // Check overlap with other snapshots (same role only)
      for (const s of otherSnapshots) {
        const p = s.period as LivestreamSnapshotEmbedded["period"]
        if (!p || !p.startTime || !p.endTime) continue
        // Only check overlap if same role (host/assistant)
        if (p.for === newPeriodTyped.for) {
          if (this.intervalsOverlap(p.startTime, p.endTime, newStart, newEnd)) {
            throw new HttpException(
              `Snapshot period overlaps with existing ${newPeriodTyped.for} snapshot period`,
              HttpStatus.BAD_REQUEST
            )
          }
        }
      }

      // apply updates
      if (payload.period)
        snapshot.period = {
          _id: newPeriodTyped._id as Types.ObjectId,
          startTime: newPeriodTyped.startTime,
          endTime: newPeriodTyped.endTime,
          channel: (newPeriodTyped.channel as Types.ObjectId).toString(),
          for: newPeriodTyped.for
        }
      if (payload.assignee)
        snapshot.assignee = new Types.ObjectId(payload.assignee)
      else {
        snapshot.assignee = null
      }
      if (typeof payload.income !== "undefined")
        snapshot.income = payload.income

      // recompute totalIncome from snapshots
      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      // Populate user info before returning
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

  // Report snapshot metrics (income, clickRate, etc.)
  async reportSnapshot(
    livestreamId: string,
    snapshotId: string,
    payload: {
      income: number
      adsCost: number
      clickRate: number
      avgViewingDuration: number
      comments: number
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

      // Access subdocument
      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const snapshot = snapshotsArray.find(
        (s) => s._id?.toString() === snapshotId
      )
      if (!snapshot)
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)

      // Update metrics
      snapshot.income = payload.income
      snapshot.adsCost = payload.adsCost
      snapshot.clickRate = payload.clickRate
      snapshot.avgViewingDuration = payload.avgViewingDuration
      snapshot.comments = payload.comments
      snapshot.ordersNote = payload.ordersNote
      if (typeof payload.rating !== "undefined") {
        snapshot.rating = payload.rating
      }

      // Recompute totalIncome from snapshots
      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
      // Populate user info before returning
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

      // remove by filtering
      livestreamDoc.snapshots = snapshotsArray.filter(
        (s) => s._id?.toString() !== snapshotId
      )

      // recompute totalIncome after removal
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

  // Set metrics for livestream (orders, income, ads)
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
      // totalIncome is computed automatically from snapshots; do not allow manual update here
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

  // Update metrics (same as set but kept for naming clarity)
  async updateLivestreamMetrics(
    livestreamId: string,
    payload: { totalOrders?: number; totalIncome?: number; ads?: number }
  ): Promise<Livestream> {
    return this.setLivestreamMetrics(livestreamId, payload)
  }

  // Get livestreams in a date range (inclusive), optionally filter by channel, role, and assignee
  async getLivestreamsByDateRange(
    startDate: Date,
    endDate: Date,
    channelId?: string,
    forRole?: "host" | "assistant",
    assigneeId?: string
  ): Promise<{ livestreams: Livestream[] }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      // Find all livestreams in date range, sorted by date
      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .sort({ date: 1 })
        .populate("snapshots.assignee", "_id name username avatarUrl")
        .exec()

      // Apply filters if provided
      let filtered = livestreams

      if (channelId || forRole || assigneeId) {
        filtered = livestreams.filter((ls) => {
          const snapshots = ls.snapshots as LivestreamSnapshotEmbedded[]
          return snapshots.some((s) => {
            if (!s.period) return false

            const channelMatch = channelId
              ? s.period.channel === channelId
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

  // Sync snapshots of livestreams in a date range with current channel periods
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

      // Get all current periods for this channel
      const currentPeriods = await this.livestreamPeriodModel
        .find({ channel: channelId })
        .exec()

      // Get all livestreams in date range
      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .exec()

      let updatedCount = 0

      for (const livestream of livestreams) {
        const livestreamDoc = livestream as LivestreamDoc

        // Skip fixed livestreams
        if (livestreamDoc.fixed) {
          continue
        }

        const snapshots =
          livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]

        // Filter to only snapshots of this channel
        const channelSnapshots = snapshots.filter(
          (s) => s.period && s.period.channel === channelId
        )

        // Create a map of existing snapshots by period._id
        const existingSnapshotsMap = new Map<
          string,
          LivestreamSnapshotEmbedded
        >()
        for (const snapshot of channelSnapshots) {
          if (snapshot.period?._id) {
            existingSnapshotsMap.set(snapshot.period._id.toString(), snapshot)
          }
        }

        // Create set of current period IDs
        const currentPeriodIds = new Set(
          currentPeriods.map((p) => p._id.toString())
        )

        // New snapshots array
        const newSnapshots: LivestreamSnapshotEmbedded[] = []

        // Keep snapshots from other channels
        for (const snapshot of snapshots) {
          if (snapshot.period && snapshot.period.channel !== channelId) {
            newSnapshots.push(snapshot)
          }
        }

        // Process current periods
        for (const period of currentPeriods as LivestreamPeriod[]) {
          const periodId = period._id.toString()
          const existingSnapshot = existingSnapshotsMap.get(periodId)

          if (existingSnapshot) {
            // Period exists: Update period info but keep assignee, goal, income
            newSnapshots.push({
              _id: existingSnapshot._id,
              period: {
                _id: period._id as Types.ObjectId,
                startTime: period.startTime,
                endTime: period.endTime,
                channel: (period.channel as Types.ObjectId).toString(),
                for: period.for
              },
              assignee: existingSnapshot.assignee, // Keep existing assignee
              income: existingSnapshot.income ?? 0
            })
          } else {
            // New period: Create new snapshot without assignee
            newSnapshots.push({
              period: {
                _id: period._id as Types.ObjectId,
                startTime: period.startTime,
                endTime: period.endTime,
                channel: (period.channel as Types.ObjectId).toString(),
                for: period.for
              },
              assignee: undefined,
              income: 0
            })
          }
        }

        // Check if snapshots changed (number, IDs, roles, or times)
        let snapshotsChanged = newSnapshots.length !== snapshots.length

        if (!snapshotsChanged) {
          // Check if any snapshot has different data
          for (let i = 0; i < newSnapshots.length; i++) {
            const newSnap = newSnapshots[i]
            const oldSnap = snapshots[i]

            // Compare period _id, for, and times
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
          // Update snapshots and recompute totalIncome
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

  // Create a monthly goal
  async createLivestreamMonthGoal(payload: {
    month: number
    year: number
    channel: string
    goal: number
  }): Promise<LivestreamMonthGoal> {
    try {
      const exists = await this.livestreamMonthGoalModel
        .findOne({
          month: payload.month,
          year: payload.year,
          channel: payload.channel
        })
        .exec()
      if (exists) {
        throw new HttpException(
          "Monthly goal already exists for this channel",
          HttpStatus.BAD_REQUEST
        )
      }
      const created = new this.livestreamMonthGoalModel({
        month: payload.month,
        year: payload.year,
        channel: payload.channel,
        goal: payload.goal
      })
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

  // Get monthly goals with pagination and optional channel filter
  async getLivestreamMonthGoals(
    page = 1,
    limit = 10,
    channel?: string
  ): Promise<{ data: LivestreamMonthGoal[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)
      const filter: any = {}
      if (typeof channel === "string" && channel.trim() !== "")
        filter.channel = channel

      const [data, total] = await Promise.all([
        this.livestreamMonthGoalModel
          .find(filter)
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .exec(),
        this.livestreamMonthGoalModel.countDocuments(filter).exec()
      ])
      return { data, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Update monthly goal
  async updateLivestreamMonthGoal(
    id: string,
    payload: { goal: number }
  ): Promise<LivestreamMonthGoal> {
    try {
      if (typeof payload.goal === "undefined") {
        throw new HttpException(
          "Goal is required for update",
          HttpStatus.BAD_REQUEST
        )
      }
      const updateObj: any = { goal: payload.goal }

      const updated = await this.livestreamMonthGoalModel
        .findByIdAndUpdate(id, { $set: updateObj }, { new: true })
        .exec()
      if (!updated)
        throw new HttpException("Monthly goal not found", HttpStatus.NOT_FOUND)
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

  // Delete monthly goal
  async deleteLivestreamMonthGoal(id: string): Promise<void> {
    try {
      await this.livestreamMonthGoalModel.findByIdAndDelete(id).exec()
      return
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Delete a livestream (hard delete)
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

  // Get all monthly goals (KPIs) for a given month/year
  async getLivestreamMonthKpis(
    month: number,
    year: number
  ): Promise<LivestreamMonthGoal[]> {
    try {
      if (
        typeof month !== "number" ||
        typeof year !== "number" ||
        isNaN(month) ||
        isNaN(year)
      ) {
        throw new HttpException("Invalid month or year", HttpStatus.BAD_REQUEST)
      }
      const res = await this.livestreamMonthGoalModel
        .find({ month, year })
        .exec()
      return res
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Channel APIs: create, search, get, update, delete
  async createLivestreamChannel(payload: {
    name: string
    username: string
    link: string
  }): Promise<LivestreamChannel> {
    try {
      const exists = await this.livestreamChannelModel
        .findOne({ username: payload.username })
        .exec()
      if (exists)
        throw new HttpException(
          "Channel already exists",
          HttpStatus.BAD_REQUEST
        )
      const created = new this.livestreamChannelModel(payload)
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

  async searchLivestreamChannels(
    searchText?: string,
    page = 1,
    limit = 10
  ): Promise<{ data: LivestreamChannel[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)
      const filter: any = {}
      if (typeof searchText === "string" && searchText.trim() !== "") {
        const regex = new RegExp(searchText.trim(), "i")
        filter.$or = [{ name: regex }, { username: regex }]
      }
      const [data, total] = await Promise.all([
        this.livestreamChannelModel
          .find(filter)
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .exec(),
        this.livestreamChannelModel.countDocuments(filter).exec()
      ])
      return { data, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getLivestreamChannelById(id: string): Promise<LivestreamChannel> {
    try {
      const doc = await this.livestreamChannelModel.findById(id).exec()
      if (!doc)
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
      return doc
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateLivestreamChannel(
    id: string,
    payload: { name?: string; username?: string; link?: string }
  ): Promise<LivestreamChannel> {
    try {
      const updateObj: any = {}
      if (typeof payload.name !== "undefined") updateObj.name = payload.name
      if (typeof payload.username !== "undefined")
        updateObj.username = payload.username
      if (typeof payload.link !== "undefined") updateObj.link = payload.link

      const updated = await this.livestreamChannelModel
        .findByIdAndUpdate(id, { $set: updateObj }, { new: true })
        .exec()
      if (!updated)
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
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

  async deleteLivestreamChannel(id: string): Promise<void> {
    try {
      await this.livestreamChannelModel.findByIdAndDelete(id).exec()
      return
    } catch (error) {
      console.error(error)
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
  }> {
    try {
      // Reuse getLivestreamsByDateRange to get filtered livestreams
      const { livestreams } = await this.getLivestreamsByDateRange(
        startDate,
        endDate,
        channelId,
        forRole,
        assigneeId
      )

      let totalIncome = 0
      let totalAdsCost = 0
      let totalComments = 0

      for (const livestream of livestreams) {
        const snapshots = livestream.snapshots as LivestreamSnapshotEmbedded[]

        for (const snapshot of snapshots) {
          // Apply filters to snapshots
          if (channelId && snapshot.period?.channel !== channelId) continue
          if (forRole && snapshot.period?.for !== forRole) continue
          if (assigneeId && snapshot.assignee?.toString() !== assigneeId)
            continue

          totalIncome += snapshot.income ?? 0
          totalAdsCost += snapshot.adsCost ?? 0
          totalComments += snapshot.comments ?? 0
        }
      }

      return {
        totalIncome,
        totalAdsCost,
        totalComments
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

  // Fix livestreams on a specific date for a specific channel (set fixed = true)
  async fixLivestreamByDate(date: Date, channelId: string): Promise<number> {
    try {
      const dayStart = new Date(date)
      dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)

      // Find all livestreams on this date
      const livestreams = await this.livestreamModel
        .find({ date: { $gte: dayStart, $lt: dayEnd } })
        .exec()

      let updated = 0

      // Fix livestreams that belong to the specified channel and are not already fixed
      for (const livestream of livestreams) {
        if (livestream.fixed) {
          continue
        }

        // Check if any snapshot belongs to the specified channel
        const snapshots = livestream.snapshots as LivestreamSnapshotEmbedded[]
        const hasChannelSnapshot = snapshots.some(
          (s) => s.period && s.period.channel === channelId
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

      // Access subdocument
      const snapshotsArray =
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      const snapshot = snapshotsArray.find(
        (s) => s._id?.toString() === snapshotId
      )
      if (!snapshot)
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)

      // Case 1: altAssignee is undefined - remove both altAssignee and altNote
      if (payload.altAssignee === undefined) {
        snapshot.altAssignee = undefined
        snapshot.altOtherAssignee = undefined
        snapshot.altNote = undefined
      } else {
        // Case 2: altAssignee is provided - validate and update

        // Check that altNote is provided
        if (!payload.altNote || payload.altNote.trim() === "") {
          throw new HttpException(
            "altNote is required when altAssignee is provided",
            HttpStatus.BAD_REQUEST
          )
        }

        // Handle "other" case
        if (payload.altAssignee === "other") {
          snapshot.altAssignee = "other"
          snapshot.altOtherAssignee = payload.altOtherAssignee
          snapshot.altNote = payload.altNote
        } else {
          // Validate user exists
          await this.validateUserExists(payload.altAssignee)

          // Check that altAssignee is different from assignee
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
      // Populate user info before returning
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

  // === ALT REQUEST METHODS ===

  // 0. Search alt requests
  async searchAltRequests(
    page = 1,
    limit = 10,
    status?: "pending" | "accepted" | "rejected",
    channel?: string,
    requestBy?: string
  ): Promise<{ data: LivestreamAltRequest[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)
      const filter: any = {}

      // Filter by status
      if (status) {
        filter.status = status
      }

      // Filter by requestBy (createdBy)
      if (requestBy) {
        filter.createdBy = requestBy
      }

      // Get requests matching initial filters
      let query = this.livestreamAltRequestModel
        .find(filter)
        .populate("createdBy", "_id name username avatarUrl")

      const requests = await query.exec()

      // Filter by channel if provided (need to check livestream snapshots)
      let filteredRequests = requests
      if (channel) {
        const filteredByChannel = []
        for (const request of requests) {
          const livestream = await this.livestreamModel
            .findById(request.livestreamId)
            .exec()
          if (livestream) {
            const snapshot = livestream.snapshots.find(
              (s: any) => s._id?.toString() === request.snapshotId.toString()
            )
            if (snapshot && (snapshot as any).period?.channel === channel) {
              filteredByChannel.push(request)
            }
          }
        }
        filteredRequests = filteredByChannel
      }

      // Apply pagination
      const total = filteredRequests.length
      const paginatedData = filteredRequests.slice(
        (safePage - 1) * safeLimit,
        safePage * safeLimit
      )

      return { data: paginatedData, total }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 1. Create alt request
  async createAltRequest(payload: {
    livestreamId: string
    snapshotId: string
    altNote: string
    createdBy: string
  }): Promise<LivestreamAltRequest> {
    try {
      // Validate user exists
      await this.validateUserExists(payload.createdBy)

      // Validate livestream exists
      const livestream = await this.livestreamModel
        .findById(payload.livestreamId)
        .exec()
      if (!livestream) {
        throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)
      }

      // Validate snapshot exists in livestream
      const snapshot = livestream.snapshots.find(
        (s: any) => s._id?.toString() === payload.snapshotId
      )
      if (!snapshot) {
        throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)
      }

      // Check if there's already a pending request for this snapshot
      const existingRequest = await this.livestreamAltRequestModel
        .findOne({
          livestreamId: payload.livestreamId,
          snapshotId: payload.snapshotId,
          status: "pending"
        })
        .exec()

      if (existingRequest) {
        throw new HttpException(
          "A pending request already exists for this snapshot",
          HttpStatus.BAD_REQUEST
        )
      }

      const created = new this.livestreamAltRequestModel({
        createdBy: new Types.ObjectId(payload.createdBy),
        livestreamId: new Types.ObjectId(payload.livestreamId),
        snapshotId: new Types.ObjectId(payload.snapshotId),
        altNote: payload.altNote,
        status: "pending"
      })

      const saved = await created.save()
      await saved.populate("createdBy", "_id name username avatarUrl")
      return saved
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 2. Update alt request (only creator can update)
  async updateAltRequest(
    requestId: string,
    userId: string,
    payload: {
      altNote: string
    }
  ): Promise<LivestreamAltRequest> {
    try {
      const request = await this.livestreamAltRequestModel
        .findById(requestId)
        .exec()
      if (!request) {
        throw new HttpException("Request not found", HttpStatus.NOT_FOUND)
      }

      // Check if user is the creator
      if (request.createdBy.toString() !== userId) {
        throw new HttpException(
          "Only the creator can update this request",
          HttpStatus.FORBIDDEN
        )
      }

      // Only allow update if status is pending
      if (request.status !== "pending") {
        throw new HttpException(
          "Cannot update request that is not pending",
          HttpStatus.BAD_REQUEST
        )
      }

      request.altNote = payload.altNote
      request.updatedAt = new Date()

      const saved = await request.save()
      await saved.populate("createdBy", "_id name username avatarUrl")
      return saved
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 3. Get request by livestream id and snapshot id
  async getRequestBySnapshot(
    livestreamId: string,
    snapshotId: string,
    userId: string,
    userRoles: string[]
  ): Promise<LivestreamAltRequest | null> {
    try {
      const request = await this.livestreamAltRequestModel
        .findOne({
          livestreamId: livestreamId,
          snapshotId: snapshotId
        })
        .populate("createdBy", "_id name username avatarUrl")
        .exec()

      if (!request) {
        return null
      }

      // Check permissions: creator, livestream-leader, or admin
      const isCreator = request.createdBy._id.toString() === userId
      const isLeaderOrAdmin =
        userRoles.includes("admin") || userRoles.includes("livestream-leader")

      if (!isCreator && !isLeaderOrAdmin) {
        throw new HttpException(
          "You don't have permission to view this request",
          HttpStatus.FORBIDDEN
        )
      }

      return request
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 4. Update request status (only leader/admin can update)
  async updateRequestStatus(
    requestId: string,
    payload: {
      status: "accepted" | "rejected"
      altAssignee?: string
    }
  ): Promise<LivestreamAltRequest> {
    try {
      const request = await this.livestreamAltRequestModel
        .findById(requestId)
        .exec()
      if (!request) {
        throw new HttpException("Request not found", HttpStatus.NOT_FOUND)
      }

      // Only allow update if current status is pending
      if (request.status !== "pending") {
        throw new HttpException(
          "Cannot update request that is not pending",
          HttpStatus.BAD_REQUEST
        )
      }

      // If accepting, altAssignee is required
      if (payload.status === "accepted") {
        if (!payload.altAssignee) {
          throw new HttpException(
            "altAssignee is required when accepting request",
            HttpStatus.BAD_REQUEST
          )
        }

        // Validate altAssignee exists
        await this.validateUserExists(payload.altAssignee)

        // Update the snapshot with altAssignee and altNote
        const livestream = await this.livestreamModel
          .findById(request.livestreamId)
          .exec()
        if (!livestream) {
          throw new HttpException("Livestream not found", HttpStatus.NOT_FOUND)
        }

        const snapshot = livestream.snapshots.find(
          (s: any) => s._id?.toString() === request.snapshotId.toString()
        )
        if (!snapshot) {
          throw new HttpException("Snapshot not found", HttpStatus.NOT_FOUND)
        }

        // Check that altAssignee is different from assignee
        const assigneeId = (snapshot as any).assignee?.toString()
        if (assigneeId === payload.altAssignee) {
          throw new HttpException(
            "altAssignee must be different from assignee",
            HttpStatus.BAD_REQUEST
          )
        }

        // Update snapshot with alt info
        ;(snapshot as any).altAssignee = new Types.ObjectId(payload.altAssignee)
        ;(snapshot as any).altNote = request.altNote

        await livestream.save()
      }

      // Update request status
      request.status = payload.status
      request.updatedAt = new Date()

      const saved = await request.save()
      await saved.populate("createdBy", "_id name username avatarUrl")
      return saved
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 5. Delete request (only creator can delete, only if pending)
  async deleteAltRequest(requestId: string, userId: string): Promise<void> {
    try {
      const request = await this.livestreamAltRequestModel
        .findById(requestId)
        .exec()
      if (!request) {
        throw new HttpException("Request not found", HttpStatus.NOT_FOUND)
      }

      // Check if user is the creator
      if (request.createdBy.toString() !== userId) {
        throw new HttpException(
          "Only the creator can delete this request",
          HttpStatus.FORBIDDEN
        )
      }

      // Only allow delete if status is pending
      if (request.status !== "pending") {
        throw new HttpException(
          "Cannot delete request that is not pending",
          HttpStatus.BAD_REQUEST
        )
      }

      await this.livestreamAltRequestModel.findByIdAndDelete(requestId).exec()
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
        // Distribute orders proportionally or count for all?
        // Based on requirement, we'll count total orders for each host that participated
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
}
