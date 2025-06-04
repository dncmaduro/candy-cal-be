import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Log } from "src/database/mongoose/schemas/Log"
import { LogDto } from "./dto/log.dto"

@Injectable()
export class LogsService {
  constructor(
    @InjectModel("logs")
    private readonly logModel: Model<Log>
  ) {}

  async createLog(log: LogDto): Promise<Log> {
    try {
      const updatedLog = await this.logModel.findOneAndUpdate(
        { date: log.date },
        { ...log, updatedAt: Date.now() },
        {
          new: true,
          upsert: true
        }
      )
      return updatedLog
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getLogs(page = 1, limit = 10): Promise<{ data: Log[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const [data, total] = await Promise.all([
        this.logModel.find().skip(skip).limit(limit).sort({ date: -1 }).exec(),
        this.logModel.countDocuments().exec()
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

  async getLog(id: string): Promise<Log> {
    try {
      const log = await this.logModel.findById(id).exec()

      if (!log) {
        throw new HttpException("Log not found", HttpStatus.NOT_FOUND)
      }

      return log
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
