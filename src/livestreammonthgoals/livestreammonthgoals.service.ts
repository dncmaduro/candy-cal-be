import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { LivestreamMonthGoal } from "../database/mongoose/schemas/LivestreamGoal"

@Injectable()
export class LivestreammonthgoalsService {
  constructor(
    @InjectModel("livestreammonthgoals")
    private readonly livestreamMonthGoalModel: Model<LivestreamMonthGoal>
  ) {}

  // Create a monthly goal
  async createLivestreamMonthGoal(payload: {
    month: number
    year: number
    channel: string
    goal: number
  }): Promise<LivestreamMonthGoal> {
    try {
      const channelId = new Types.ObjectId(payload.channel)

      const exists = await this.livestreamMonthGoalModel
        .findOne({
          month: payload.month,
          year: payload.year,
          channel: channelId
        })
        .exec()

      if (exists) {
        throw new HttpException(
          "Monthly goal already exists for this channel",
          HttpStatus.BAD_REQUEST
        )
      }

      const created = await this.livestreamMonthGoalModel.create({
        month: payload.month,
        year: payload.year,
        channel: channelId,
        goal: payload.goal
      })

      // Trả về bản đã populate
      const populated = await this.livestreamMonthGoalModel
        .findById(created._id)
        .populate("channel")
        .exec()

      return populated as unknown as LivestreamMonthGoal
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
      if (typeof channel === "string" && channel.trim() !== "") {
        filter.channel = new Types.ObjectId(channel)
      }

      const [data, total] = await Promise.all([
        this.livestreamMonthGoalModel
          .find(filter)
          .populate("channel")
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
        .populate("channel")
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

      const updated = await this.livestreamMonthGoalModel
        .findByIdAndUpdate(id, { $set: { goal: payload.goal } }, { new: true })
        .populate("channel")
        .exec()

      if (!updated) {
        throw new HttpException("Monthly goal not found", HttpStatus.NOT_FOUND)
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
}
