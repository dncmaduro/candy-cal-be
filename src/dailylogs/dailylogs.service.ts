import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { DailyLog } from "../database/mongoose/schemas/DailyLog"
import { DailyLogDto } from "./dto/dailylogs.dto"

@Injectable()
export class DailyLogsService {
  constructor(
    @InjectModel("dailylogs")
    private readonly dailyLogModel: Model<DailyLog>
  ) {}

  async createDailyLog(dto: DailyLogDto): Promise<void> {
    try {
      // Require channelId since one date can have multiple logs for different channels
      if (!dto.channelId) {
        throw new HttpException("channelId is required", HttpStatus.BAD_REQUEST)
      }

      // Delete existing log for this specific date + channel combination
      const filter = {
        date: dto.date,
        channel: dto.channelId
      }
      await this.dailyLogModel.findOneAndDelete(filter).exec()

      // Create new log for this date + channel
      await this.dailyLogModel.create({
        ...dto,
        channel: dto.channelId,
        updatedAt: new Date()
      })
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi tạo log ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getDailyLogs(
    channelId?: string,
    page = 1,
    limit = 10
  ): Promise<{ data: DailyLog[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const query: any = {}
      if (channelId) query.channel = channelId
      const [data, total] = await Promise.all([
        this.dailyLogModel
          .find(query)
          .populate("channel")
          .skip(skip)
          .limit(limit)
          .sort({ date: -1 })
          .exec(),
        this.dailyLogModel.countDocuments(query).exec()
      ])
      return { data, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy log ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getDailyLogByDate(
    date: Date,
    channelId?: string
  ): Promise<DailyLog | null> {
    try {
      const query: any = { date }
      if (channelId) query.channel = channelId
      return await this.dailyLogModel.findOne(query).populate("channel").exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy log ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
