import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { SessionLog } from "../database/mongoose/schemas/SessionLog"
import { SessionLogDto } from "./dto/sessionlogs.dto"

@Injectable()
export class SessionLogsService {
  constructor(
    @InjectModel("sessionlogs")
    private readonly sessionLogModel: Model<SessionLog>
  ) {}

  async createSessionLog(dto: SessionLogDto): Promise<void> {
    try {
      const newLog = new this.sessionLogModel(dto)
      await newLog.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo log phiên",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteSessionLog(id: string): Promise<void> {
    try {
      await this.sessionLogModel.findByIdAndDelete(id)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xóa log phiên",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getSessionLogs(
    page = 1,
    limit = 10
  ): Promise<{ data: SessionLog[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const [data, total] = await Promise.all([
        this.sessionLogModel
          .find()
          .skip(skip)
          .limit(limit)
          .sort({ time: -1 })
          .exec(),
        this.sessionLogModel.countDocuments().exec()
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

  async getSessionLogById(id: string): Promise<SessionLog | null> {
    try {
      return await this.sessionLogModel.findOne({ _id: id }).exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
