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
      const filter = { date: dto.date }
      const update = { ...dto, updatedAt: new Date() }
      await this.dailyLogModel.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo log ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getDailyLogs(
    page = 1,
    limit = 10
  ): Promise<{ data: DailyLog[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const [data, total] = await Promise.all([
        this.dailyLogModel
          .find()
          .skip(skip)
          .limit(limit)
          .sort({ date: -1 })
          .exec(),
        this.dailyLogModel.countDocuments().exec()
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

  async getDailyLogByDate(date: Date): Promise<DailyLog | null> {
    try {
      return await this.dailyLogModel.findOne({ date }).exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy log ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
