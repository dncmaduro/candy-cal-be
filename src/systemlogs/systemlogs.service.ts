import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { SystemLog } from "../database/mongoose/schemas/SystemLog"
import { SystemLogsDto } from "./dto/systemlogs.dto"
import { User } from "../database/mongoose/schemas/User"
import { labelOf } from "./i18n.vi"

@Injectable()
export class SystemLogsService {
  constructor(
    @InjectModel("SystemLog")
    private readonly systemLogModel: Model<SystemLog>,
    @InjectModel("users")
    private readonly userModel: Model<User>
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
    action?: string,
    startTime?: Date,
    endTime?: Date,
    entity?: string,
    entityId?: string,
    result?: "success" | "failed"
  ): Promise<{ data: SystemLog[]; total: number }> {
    const query: Record<string, any> = {}
    if (userId) query.userId = userId
    if (type) query.type = type
    if (action) query.action = action
    if (entity) query.entity = entity
    if (entityId) query.entityId = entityId
    if (result) query.result = result

    // time range
    const isValidDate = (d?: Date) => d instanceof Date && !isNaN(d.getTime())
    if (isValidDate(startTime)) query.time = { $gte: startTime }
    if (isValidDate(endTime)) query.time = { ...query.time, $lte: endTime }

    const total = await this.systemLogModel.countDocuments(query)
    const data = await this.systemLogModel
      .find(query)
      .skip((page - 1) * limit)
      .limit(limit)
      .sort({ time: -1 })

    return { data, total }
  }

  // selections for FE
  async listUsersForSelect(): Promise<{
    data: { value: string; label: string }[]
  }> {
    const users = await this.userModel
      .find({}, { _id: 1, name: 1, username: 1 })
      .sort({ name: 1 })
      .lean()
    return {
      data: users.map((u) => ({
        value: u._id.toString(),
        label: u.name || u.username
      }))
    }
  }

  async listTypes(): Promise<{ data: { value: string; label: string }[] }> {
    const types = await this.systemLogModel.distinct("type")
    return {
      data: (types as string[])
        .filter((t) => !!t && String(t).trim().length > 0)
        .map((t) => ({ value: String(t), label: labelOf("type", String(t)) }))
    }
  }

  async listActions(): Promise<{ data: { value: string; label: string }[] }> {
    const actions = await this.systemLogModel.distinct("action")
    return {
      data: (actions as string[])
        .filter((a) => !!a && String(a).trim().length > 0)
        .map((a) => ({ value: String(a), label: labelOf("action", String(a)) }))
    }
  }

  async listEntities(): Promise<{ data: { value: string; label: string }[] }> {
    const entities = await this.systemLogModel.distinct("entity")
    return {
      data: (entities as string[])
        .filter((e) => !!e && String(e).trim().length > 0)
        .map((e) => ({ value: String(e), label: labelOf("entity", String(e)) }))
    }
  }

  async listEntityIdsByEntity(
    entity: string
  ): Promise<{ data: { value: string; label: string }[] }> {
    const ids = await this.systemLogModel.distinct("entityId", { entity })
    return {
      data: (ids as string[])
        .filter((id) => !!id && String(id).trim().length > 0)
        .map((id) => ({ value: String(id), label: String(id) }))
    }
  }

  // Remove logs older than `retentionDays`
  async cleanupOldLogs(retentionDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)
    const res = await this.systemLogModel.deleteMany({ time: { $lt: cutoff } })
    return res.deletedCount ?? 0
  }
}
