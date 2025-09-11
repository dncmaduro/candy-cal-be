import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types, HydratedDocument } from "mongoose"
import { LivestreamEmployee } from "../database/mongoose/schemas/LivestreamEmployee"
import { LivestreamPeriod } from "../database/mongoose/schemas/LivestreamPeriod"
import {
  Livestream,
  LivestreamSnapshotEmbedded
} from "../database/mongoose/schemas/Livestream"
import { LivestreamMonthGoal } from "../database/mongoose/schemas/LivestreamGoal"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"

type LivestreamDoc = HydratedDocument<Livestream>

@Injectable()
export class LivestreamService {
  constructor(
    @InjectModel("livestreamemployees")
    private readonly livestreamEmployeeModel: Model<LivestreamEmployee>,
    @InjectModel("livestreamperiods")
    private readonly livestreamPeriodModel: Model<LivestreamPeriod>,
    @InjectModel("livestreammonthgoals")
    private readonly livestreamMonthGoalModel: Model<LivestreamMonthGoal>,
    @InjectModel("livestreams")
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>
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

  // Create a new livestream employee
  async createLivestreamEmployee(payload: {
    name: string
    active?: boolean
  }): Promise<LivestreamEmployee> {
    try {
      const created = new this.livestreamEmployeeModel({
        name: payload.name,
        active: payload.active ?? true
      })
      return await created.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Retrieve all employees, supports searchText, pagination, and optional active filter
  async getAllLivestreamEmployees(
    searchText?: string,
    page = 1,
    limit = 10,
    active?: boolean
  ): Promise<{ data: LivestreamEmployee[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter: any = {}
      if (typeof active === "boolean") filter.active = active
      if (typeof searchText === "string" && searchText.trim() !== "") {
        filter.name = { $regex: searchText.trim(), $options: "i" }
      }

      const [data, total] = await Promise.all([
        this.livestreamEmployeeModel
          .find(filter)
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .exec(),
        this.livestreamEmployeeModel.countDocuments(filter).exec()
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

  // Retrieve a single employee by id
  async getLivestreamEmployeeById(id: string): Promise<LivestreamEmployee> {
    try {
      const doc = await this.livestreamEmployeeModel.findById(id).exec()
      if (!doc)
        throw new HttpException(
          "Livestream employee not found",
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

  // Update an employee's fields
  async updateLivestreamEmployee(
    id: string,
    payload: { name?: string; active?: boolean }
  ): Promise<LivestreamEmployee> {
    try {
      const updated = await this.livestreamEmployeeModel
        .findByIdAndUpdate(id, { $set: payload }, { new: true })
        .exec()
      if (!updated)
        throw new HttpException(
          "Livestream employee not found",
          HttpStatus.NOT_FOUND
        )
      return updated
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Soft delete: mark employee as inactive
  async deleteLivestreamEmployee(id: string): Promise<void> {
    try {
      await this.livestreamEmployeeModel
        .findByIdAndUpdate(id, { $set: { active: false } }, { new: true })
        .exec()
      return
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
    noon?: boolean
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

      // check overlap within same channel
      const sameChannel = await this.livestreamPeriodModel
        .find({ channel: payload.channel })
        .exec()
      // if new period is noon, ensure no other noon exists on same channel
      if (payload.noon) {
        const hasNoon = (sameChannel as LivestreamPeriod[]).some((p) =>
          Boolean(p.noon)
        )
        if (hasNoon) {
          throw new HttpException(
            "Only one noon period is allowed per channel",
            HttpStatus.BAD_REQUEST
          )
        }
      }
      for (const p of sameChannel as LivestreamPeriod[]) {
        // skip time-overlap check if either existing or new period is a 'noon' period
        if (Boolean(p.noon) || Boolean(payload.noon)) continue
        if (
          this.intervalsOverlap(
            payload.startTime,
            payload.endTime,
            p.startTime as any,
            p.endTime as any
          )
        ) {
          throw new HttpException(
            "Period overlaps with existing period on the same channel",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      const created = new this.livestreamPeriodModel({
        startTime: payload.startTime,
        endTime: payload.endTime,
        channel: payload.channel,
        noon: payload.noon
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

  // Retrieve all livestream periods
  async getAllLivestreamPeriods(): Promise<{ periods: LivestreamPeriod[] }> {
    try {
      const periods = await this.livestreamPeriodModel.find().exec()
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
      const doc = await this.livestreamPeriodModel.findById(id).exec()
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
      noon?: boolean
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

      const channelToCheck = payload.channel ?? (existing as any).channel

      // check overlap with other periods on same channel
      const others = await this.livestreamPeriodModel
        .find({ channel: channelToCheck, _id: { $ne: id } })
        .exec()
      const newIsNoon = Boolean(payload.noon ?? (existing as any).noon)
      // if new period is noon, ensure no other noon exists on same channel (excluding itself)
      if (newIsNoon) {
        const hasOtherNoon = (others as LivestreamPeriod[]).some((p) =>
          Boolean(p.noon)
        )
        if (hasOtherNoon) {
          throw new HttpException(
            "Only one noon period is allowed per channel",
            HttpStatus.BAD_REQUEST
          )
        }
      }
      for (const p of others as LivestreamPeriod[]) {
        // skip overlap check if either existing or new is noon
        if (Boolean(p.noon) || newIsNoon) continue
        if (
          this.intervalsOverlap(
            newStart,
            newEnd,
            p.startTime as any,
            p.endTime as any
          )
        ) {
          throw new HttpException(
            "Updated period overlaps with existing period on the same channel",
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
      if (typeof payload.noon !== "undefined") updateObj.noon = payload.noon

      const updated = await this.livestreamPeriodModel
        .findByIdAndUpdate(id, { $set: updateObj }, { new: true })
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

      // if snapshots (period ids) provided, create embedded snapshots without host/assistant
      if (Array.isArray(payload.snapshots) && payload.snapshots.length > 0) {
        const periods = await this.livestreamPeriodModel
          .find({ _id: { $in: payload.snapshots } })
          .exec()
        // map and push snapshots (no host/assistant)
        createdObj.snapshots = periods.map((p) => {
          const isNoon = Boolean((p as any).noon)
          return {
            period: {
              _id: p._id as Types.ObjectId,
              startTime: (p as any).startTime,
              endTime: (p as any).endTime,
              channel: (p as any).channel,
              noon: (p as any).noon
            },
            // noon snapshots must not have goal or income
            ...(isNoon
              ? {}
              : {
                  goal: 0,
                  income: 0
                }),
            // keep noon flag explicit when needed
            noon: isNoon
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
      host: string
      assistant: string
      goal: number
      income?: number
      noon?: boolean
    }
  ): Promise<Livestream> {
    try {
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

      // Check noon uniqueness (snapshot-level noon)
      // determine if this snapshot will be a noon snapshot (period.noon OR payload.noon)
      const snapshotWillBeNoon =
        Boolean(payload.noon) || Boolean(newPeriodTyped.noon)
      const existingNoon = (
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      ).some((s) => Boolean(s.noon))
      if (snapshotWillBeNoon && existingNoon) {
        throw new HttpException(
          "Only one noon snapshot is allowed per livestream",
          HttpStatus.BAD_REQUEST
        )
      }

      // If this will be a noon snapshot, disallow host/goal/income in the payload
      if (snapshotWillBeNoon) {
        if (payload.host)
          throw new HttpException(
            "Noon snapshots must not have a host",
            HttpStatus.BAD_REQUEST
          )
        if (typeof payload.goal !== "undefined" && payload.goal !== null)
          throw new HttpException(
            "Noon snapshots must not have a goal",
            HttpStatus.BAD_REQUEST
          )
        if (typeof payload.income !== "undefined" && payload.income !== null)
          throw new HttpException(
            "Noon snapshots must not have income",
            HttpStatus.BAD_REQUEST
          )
      }

      // Check channel consistency: all snapshots must be from same channel
      const existingChannels = new Set<string>()
      for (const s of livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]) {
        if (s.period && s.period.channel) existingChannels.add(s.period.channel)
      }
      if (existingChannels.size > 0) {
        const only = Array.from(existingChannels)[0]
        if (only !== newPeriodTyped.channel) {
          throw new HttpException(
            "Snapshots in one livestream must belong to the same channel",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // Check time overlap with existing embedded periods (end exclusive)
      for (const s of livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]) {
        const p = s.period as LivestreamSnapshotEmbedded["period"]
        if (!p || !p.startTime || !p.endTime) continue
        // skip overlap check if either embedded period is noon or new period is noon
        if (Boolean(p.noon) || snapshotWillBeNoon) continue
        if (this.intervalsOverlap(p.startTime, p.endTime, newStart, newEnd)) {
          throw new HttpException(
            "Snapshot period overlaps with existing snapshot period",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // push subdocument (typed) — store a snapshot of the period object
      const newSnapshot: LivestreamSnapshotEmbedded = {
        period: {
          _id: newPeriodTyped._id as Types.ObjectId,
          startTime: newPeriodTyped.startTime,
          endTime: newPeriodTyped.endTime,
          channel: newPeriodTyped.channel,
          noon: newPeriodTyped.noon
        },
        // host is only allowed for non-noon snapshots
        ...(snapshotWillBeNoon
          ? {}
          : {
              host: payload.host ? new Types.ObjectId(payload.host) : undefined
            }),
        // assistant may be present for both
        ...(payload.assistant
          ? { assistant: new Types.ObjectId(payload.assistant) }
          : {}),
        // goal and income only for non-noon snapshots
        ...(snapshotWillBeNoon
          ? {}
          : { goal: payload.goal ?? 0, income: payload.income ?? 0 }),
        noon: snapshotWillBeNoon
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
      host?: string
      assistant?: string
      goal?: number
      income?: number
      noon?: boolean
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

      // If period or noon changed, re-run conflict checks
      const newPeriodId = payload.period
        ? payload.period
        : (
            snapshot.period as LivestreamSnapshotEmbedded["period"]
          )?._id?.toString()
      const newNoon =
        typeof payload.noon !== "undefined"
          ? payload.noon
          : Boolean(snapshot.noon)

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

      // determine if resulting snapshot will be noon (period.noon OR requested noon)
      const snapshotWillBeNoon =
        Boolean(newNoon) || Boolean(newPeriodTyped.noon)
      // noon uniqueness
      const hasOtherNoon = otherSnapshots.some((s) => Boolean(s.noon))
      if (snapshotWillBeNoon && hasOtherNoon) {
        throw new HttpException(
          "Only one noon snapshot is allowed per livestream",
          HttpStatus.BAD_REQUEST
        )
      }

      // If resulting snapshot is noon, disallow host/goal/income in payload
      if (snapshotWillBeNoon) {
        if (payload.host)
          throw new HttpException(
            "Noon snapshots must not have a host",
            HttpStatus.BAD_REQUEST
          )
        if (typeof payload.goal !== "undefined" && payload.goal !== null)
          throw new HttpException(
            "Noon snapshots must not have a goal",
            HttpStatus.BAD_REQUEST
          )
        if (typeof payload.income !== "undefined" && payload.income !== null)
          throw new HttpException(
            "Noon snapshots must not have income",
            HttpStatus.BAD_REQUEST
          )
      }

      // Check channel consistency
      const existingChannels = new Set<string>()
      for (const s of otherSnapshots) {
        if (s.period && s.period.channel) existingChannels.add(s.period.channel)
      }
      if (existingChannels.size > 0) {
        const only = Array.from(existingChannels)[0]
        if (only !== newPeriodTyped.channel) {
          throw new HttpException(
            "Snapshots in one livestream must belong to the same channel",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // Check overlap with other snapshots
      for (const s of otherSnapshots) {
        const p = s.period as LivestreamSnapshotEmbedded["period"]
        if (!p || !p.startTime || !p.endTime) continue
        // skip overlap check if either side is noon
        if (Boolean(p.noon) || snapshotWillBeNoon) continue
        if (this.intervalsOverlap(p.startTime, p.endTime, newStart, newEnd)) {
          throw new HttpException(
            "Snapshot period overlaps with existing snapshot period",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // apply updates
      if (payload.period)
        snapshot.period = {
          _id: newPeriodTyped._id as Types.ObjectId,
          startTime: newPeriodTyped.startTime,
          endTime: newPeriodTyped.endTime,
          channel: newPeriodTyped.channel,
          noon: newPeriodTyped.noon
        }
      // host only allowed for non-noon snapshots
      if (!snapshotWillBeNoon && payload.host)
        snapshot.host = new Types.ObjectId(payload.host)
      // assistant may be updated independently
      if (payload.assistant)
        snapshot.assistant = new Types.ObjectId(payload.assistant)
      // goal/income only allowed for non-noon snapshots
      if (!snapshotWillBeNoon && typeof payload.goal !== "undefined")
        snapshot.goal = payload.goal
      if (!snapshotWillBeNoon && typeof payload.income !== "undefined")
        snapshot.income = payload.income
      // set noon flag according to resulting state
      snapshot.noon = snapshotWillBeNoon

      // recompute totalIncome from snapshots
      livestreamDoc.totalIncome = this.computeTotalIncome(
        livestreamDoc.snapshots as LivestreamSnapshotEmbedded[]
      )

      await livestreamDoc.save()
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

  // Get livestreams in a date range (inclusive)
  async getLivestreamsByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<{ livestreams: Livestream[] }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)
      const livestreams = await this.livestreamModel
        .find({ date: { $gte: start, $lte: end } })
        .exec()

      return { livestreams }
    } catch (error) {
      console.error(error)
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
    incomeByHost: { hostId: string; income: number }[]
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
      const byHost = new Map<string, number>()

      for (const ls of livestreams) {
        totalIncome += (ls.totalIncome ?? 0) as number
        totalExpenses += (ls.ads ?? 0) as number
        totalOrders += (ls.totalOrders ?? 0) as number

        const snapshots = (ls.snapshots ?? []) as LivestreamSnapshotEmbedded[]
        for (const s of snapshots) {
          if (!s) continue
          const income = s.income ?? 0
          if (s.host) {
            const hostId = (s.host as Types.ObjectId).toString()
            byHost.set(hostId, (byHost.get(hostId) ?? 0) + income)
          }
        }
      }

      const incomeByHost = Array.from(byHost.entries()).map(
        ([hostId, income]) => ({
          hostId,
          income
        })
      )

      return { totalIncome, totalExpenses, totalOrders, incomeByHost }
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
}
