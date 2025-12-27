import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { LivestreamPeriod } from "../database/mongoose/schemas/LivestreamPeriod"

@Injectable()
export class LivestreamperiodsService {
  constructor(
    @InjectModel("livestreamperiods")
    private readonly livestreamPeriodModel: Model<LivestreamPeriod>
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
}
