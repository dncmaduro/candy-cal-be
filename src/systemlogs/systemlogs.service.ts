import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { SystemLog } from "../database/mongoose/schemas/SystemLog"
import { SystemLogsDto } from "./dto/systemlogs.dto"

@Injectable()
export class SystemLogsService {
  constructor(
    @InjectModel("SystemLog")
    private readonly systemLogModel: Model<SystemLog>
  ) {}

  async createSystemLog(
    systemLogDto: SystemLogsDto,
    userId: string
  ): Promise<SystemLog> {
    const systemLog = {
      ...systemLogDto,
      time: new Date(),
      userId
    }
    const newSystemLog = new this.systemLogModel(systemLog)
    return await newSystemLog.save()
  }

  async getSystemLogs(
    page: number = 1,
    limit: number = 10,
    userId?: string,
    type?: string,
    startTime?: Date,
    endTime?: Date
  ): Promise<{ data: SystemLog[]; total: number }> {
    const query: Record<string, any> = {}
    if (userId) query.userId = userId
    if (type) query.type = type
    if (startTime) query.time = { $gte: startTime }
    if (endTime) query.time = { ...query.time, $lte: endTime }

    const total = await this.systemLogModel.countDocuments(query)
    const data = await this.systemLogModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ time: -1 })

    return { data, total }
  }
}
