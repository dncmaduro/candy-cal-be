import {
  Injectable,
  HttpException,
  HttpStatus,
  ForbiddenException
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { RoleTaskDef } from "../database/mongoose/schemas/RoleTaskDef"
import { DailyUserTask } from "../database/mongoose/schemas/DailyUserTask"
import { User } from "../database/mongoose/schemas/User"
import { ApiEndpoint } from "../database/mongoose/schemas/ApiEndpoint"
import { RequestAudit } from "../database/mongoose/schemas/RequestAudit"

interface UpsertOptions {
  regenerate?: boolean
}

@Injectable()
export class DailyTasksService {
  constructor(
    @InjectModel("RoleTaskDef")
    private readonly roleTaskDefModel: Model<RoleTaskDef>,
    @InjectModel("DailyUserTask")
    private readonly dailyUserTaskModel: Model<DailyUserTask>,
    @InjectModel("users") private readonly userModel: Model<User>,
    @InjectModel("ApiEndpoint")
    private readonly apiEndpointModel: Model<ApiEndpoint>,
    @InjectModel("RequestAudit")
    private readonly auditModel: Model<RequestAudit>
  ) {}

  private formatDate(date: Date): string {
    // Use local calendar date to avoid UTC shifting (off-by-one day)
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, "0")
    const d = String(date.getDate()).padStart(2, "0")
    return `${y}${m}${d}`
  }

  // Normalize various date inputs to yyyymmdd
  private toDateKey(input?: string): string {
    if (!input) return this.formatDate(new Date())
    if (/^\d{8}$/.test(input)) return input
    const dt = new Date(input)
    dt.setHours(0, 0, 0, 0)
    return this.formatDate(dt)
  }

  async generateForDate(
    rawDate?: Date | string,
    opts: UpsertOptions = {}
  ): Promise<{ date: string; users: number; tasksCreated: number }> {
    const dateObj = rawDate ? new Date(rawDate) : new Date()
    dateObj.setHours(0, 0, 0, 0)
    const date = this.formatDate(dateObj)

    const activeDefs = await this.roleTaskDefModel.find({ active: true }).lean()
    if (activeDefs.length === 0) return { date, users: 0, tasksCreated: 0 }

    const users = await this.userModel.find({}, { _id: 1, role: 1 }).lean()
    let tasksCreated = 0

    const endpoints = await this.apiEndpointModel
      .find({ active: true, deleted: false })
      .lean()
    const endpointMap = new Map(endpoints.map((e) => [e.key, e]))

    for (const u of users) {
      const defsForRole = activeDefs.filter((d) =>
        d.roles.some((r) => u.roles && u.roles.includes(r))
      )
      if (defsForRole.length === 0) continue

      let daily = await this.dailyUserTaskModel.findOne({ userId: u._id, date })
      if (!daily) {
        daily = new this.dailyUserTaskModel({
          userId: u._id,
          date,
          tasks: [],
          summary: { total: 0, done: 0, auto: 0, pending: 0, expired: 0 }
        })
      } else if (!opts.regenerate) {
        // skip existing if not regenerate
        continue
      } else if (opts.regenerate) {
        daily.tasks = daily.tasks.filter((t) =>
          defsForRole.some((d) => d.code === t.code)
        )
      }

      const existingCodes = new Set(daily.tasks.map((t) => t.code))
      for (const def of defsForRole) {
        if (!existingCodes.has(def.code)) {
          if (def.type === "http") {
            const cfg = def.httpConfig
            if (!cfg || !cfg.endpointKey) continue
            const ep = endpointMap.get(cfg.endpointKey)
            if (!ep) continue
            const runAt = cfg.runAt
            if (!runAt) continue
            daily.tasks.push({
              code: def.code,
              title: def.title,
              status: "pending",
              type: "http",
              http: {
                endpointKey: cfg.endpointKey,
                method: ep.method,
                url: ep.url,
                runAt,
                successStatus: cfg.successStatus ?? 200,
                successJsonPath: cfg.successJsonPath,
                successEquals: cfg.successEquals,
                autoCompleteOnSuccess: cfg.autoCompleteOnSuccess ?? true,
                maxAttempts: cfg.maxAttempts ?? 1,
                attempts: 0
              }
            })
          } else {
            daily.tasks.push({
              code: def.code,
              title: def.title,
              status: "pending",
              type: "manual"
            })
          }
          tasksCreated++
        }
      }
      // summary recompute
      this.recomputeSummary(daily)
      await daily.save()
    }

    return { date, users: users.length, tasksCreated }
  }

  private recomputeSummary(doc: DailyUserTask) {
    const summary = { total: 0, done: 0, auto: 0, pending: 0, expired: 0 }
    for (const t of doc.tasks) {
      summary.total++
      if (t.status === "done") summary.done++
      else if (t.status === "auto") summary.auto++
      else if (t.status === "pending") summary.pending++
      else if (t.status === "expired") summary.expired++
    }
    doc.summary = summary as any
  }

  async getMyToday(
    userId: string
  ): Promise<{ date: string; tasks: any[]; summary: any }> {
    const date = this.formatDate(new Date())
    const objectId = new Types.ObjectId(userId)

    let daily = await this.dailyUserTaskModel
      .findOne({ userId: objectId, date })
      .lean()

    if (!daily) {
      await this.generateForDate(undefined)
      daily = await this.dailyUserTaskModel
        .findOne({ userId: objectId, date })
        .lean()
    }

    if (!daily) {
      return {
        date,
        tasks: [],
        summary: { total: 0, done: 0, auto: 0, pending: 0, expired: 0 }
      }
    }

    return { date, tasks: daily.tasks, summary: daily.summary }
  }

  // Admin: get a user's daily tasks by date (defaults to today). For today, auto-generate if missing; otherwise return stored state.
  async getUserTasksByDate(
    userId: string,
    dateInput?: string
  ): Promise<{ date: string; tasks: any[]; summary: any }> {
    const requestedKey = this.toDateKey(dateInput)
    const todayKey = this.formatDate(new Date())

    let daily = await this.dailyUserTaskModel
      .findOne({ userId: new Types.ObjectId(userId), date: requestedKey })
      .lean()

    if (!daily && (!dateInput || requestedKey === todayKey)) {
      // Only auto-generate if querying for today or date not provided
      await this.generateForDate(undefined)
      daily = await this.dailyUserTaskModel
        .findOne({ userId: new Types.ObjectId(userId), date: requestedKey })
        .lean()
    }

    if (!daily)
      return {
        date: requestedKey,
        tasks: [],
        summary: { total: 0, done: 0, auto: 0, pending: 0, expired: 0 }
      }

    return { date: requestedKey, tasks: daily.tasks, summary: daily.summary }
  }

  // Admin: get all users' daily tasks by date (defaults to today). For today, auto-generate if missing; otherwise return stored state.
  async getAllUsersTasksByDate(dateInput?: string): Promise<{
    date: string
    items: Array<{ userId: string; total: number; done: number }>
  }> {
    const requestedKey = this.toDateKey(dateInput)
    const todayKey = this.formatDate(new Date())

    if (!dateInput || requestedKey === todayKey) {
      // Ensure today's tasks are generated for all users
      await this.generateForDate(undefined)
    }

    // Load all users to ensure every user is represented
    const users = await this.userModel.find({}, { _id: 1 }).lean()

    // Load summaries for the requested date
    const docs = await this.dailyUserTaskModel
      .find({ date: requestedKey }, { userId: 1, summary: 1 })
      .lean()

    const summaryByUser = new Map<string, { total?: number; done?: number }>()
    for (const d of docs) {
      summaryByUser.set(String(d.userId), {
        total: d.summary?.total ?? 0,
        done: d.summary?.done ?? 0
      })
    }

    const items = users.map((u) => {
      const key = String(u._id)
      const s = summaryByUser.get(key)
      return {
        userId: key,
        total: s?.total ?? 0,
        done: s?.done ?? 0
      }
    })

    return { date: requestedKey, items }
  }

  async markDone(
    userId: string,
    code: string,
    userRole?: string
  ): Promise<{ updated: boolean }> {
    const date = this.formatDate(new Date())
    const doc = await this.dailyUserTaskModel.findOne({
      userId: new Types.ObjectId(userId),
      date
    })
    if (!doc) throw new HttpException("Chưa có task ngày", HttpStatus.NOT_FOUND)
    const task = doc.tasks.find((t) => t.code === code)
    if (!task)
      throw new HttpException("Không tìm thấy task", HttpStatus.NOT_FOUND)
    // Block manual done for HTTP tasks unless admin
    if (task.type === "http" && userRole !== "admin") {
      throw new ForbiddenException("HTTP task không được tự đánh hoàn thành")
    }
    if (task.status !== "pending") return { updated: false }
    task.status = "done"
    task.completedAt = new Date()
    this.recomputeSummary(doc)
    await doc.save()
    return { updated: true }
  }

  async manualRecheck(userId: string, code: string): Promise<boolean> {
    const date = this.formatDate(new Date())
    const doc = await this.dailyUserTaskModel.findOne({
      userId: new Types.ObjectId(userId),
      date
    })
    if (!doc) throw new HttpException("Chưa có task ngày", HttpStatus.NOT_FOUND)
    const task = doc.tasks.find((t) => t.code === code)
    if (!task)
      throw new HttpException("Không tìm thấy task", HttpStatus.NOT_FOUND)
    if (task.status !== "pending" || task.type !== "http" || !task.http)
      return false

    // Check RequestAudit instead of calling external endpoint
    const found = await this.auditModel.exists({
      userId: new Types.ObjectId(userId),
      date,
      endpointKey: task.http.endpointKey
    })
    task.http.attempts = (task.http.attempts || 0) + 1
    task.http.lastCheckAt = new Date()
    task.http.lastResult = found ? "success" : "fail"
    task.http.message = found ? "FOUND" : "NOT_FOUND"
    if (found && task.http.autoCompleteOnSuccess) {
      task.status = "done"
      task.completedAt = new Date()
    }
    this.recomputeSummary(doc)
    await doc.save()
    return true
  }

  // ADMIN defs
  async listDefinitions(
    page = 1,
    limit = 20
  ): Promise<{ data: any[]; total: number }> {
    const safePage = Math.max(1, Number(page) || 1)
    const safeLimit = Math.min(100, Math.max(1, Number(limit) || 20))
    const total = await this.roleTaskDefModel.countDocuments({})
    const data = await this.roleTaskDefModel
      .find()
      .sort({ order: 1, code: 1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .lean()
    return { data, total }
  }
  async createDefinition(payload: {
    code: string
    title: string
    roles: string[]
    order?: number
    autoComplete?: boolean
    type?: "manual" | "http"
    httpConfig?: {
      endpointKey: string
      runAt: string
      successStatus?: number
      successJsonPath?: string
      successEquals?: any
      autoCompleteOnSuccess?: boolean
      maxAttempts?: number
    }
  }): Promise<any> {
    const existed = await this.roleTaskDefModel.findOne({ code: payload.code })
    if (existed) throw new HttpException("Code đã tồn tại", HttpStatus.CONFLICT)
    const doc = await this.roleTaskDefModel.create({
      code: payload.code,
      title: payload.title,
      roles: payload.roles,
      order: payload.order ?? 0,
      autoComplete: payload.autoComplete ?? false,
      type: payload.type || "manual",
      httpConfig:
        payload.type === "http"
          ? {
              endpointKey: payload.httpConfig?.endpointKey,
              runAt: payload.httpConfig?.runAt,
              successStatus: payload.httpConfig?.successStatus,
              successJsonPath: payload.httpConfig?.successJsonPath,
              successEquals: payload.httpConfig?.successEquals,
              autoCompleteOnSuccess:
                payload.httpConfig?.autoCompleteOnSuccess ?? true,
              maxAttempts: payload.httpConfig?.maxAttempts ?? 1
            }
          : undefined
    })
    return doc.toObject()
  }
  async updateDefinition(
    code: string,
    payload: Partial<{
      title: string
      roles: string[]
      active: boolean
      order: number
      autoComplete: boolean
      type: "manual" | "http"
      httpConfig: {
        endpointKey?: string
        runAt?: string
        successStatus?: number
        successJsonPath?: string
        successEquals?: any
        autoCompleteOnSuccess?: boolean
        maxAttempts?: number
      }
    }>
  ): Promise<any> {
    const doc = await this.roleTaskDefModel.findOne({ code })
    if (!doc) throw new HttpException("Không tìm thấy", HttpStatus.NOT_FOUND)
    if (payload.title !== undefined) doc.title = payload.title
    if (payload.roles !== undefined) doc.roles = payload.roles
    if (payload.active !== undefined) doc.active = payload.active
    if (payload.order !== undefined) doc.order = payload.order
    if (payload.autoComplete !== undefined)
      doc.autoComplete = payload.autoComplete
    if (payload.type !== undefined) doc.type = payload.type
    if (payload.httpConfig !== undefined) {
      if (doc.type !== "http") {
        // nếu chuyển từ manual sang http hoặc đang http
        doc.type = "http"
      }
      doc.httpConfig = {
        endpointKey:
          payload.httpConfig.endpointKey ?? doc.httpConfig?.endpointKey,
        runAt: payload.httpConfig.runAt ?? doc.httpConfig?.runAt,
        successStatus:
          payload.httpConfig.successStatus ?? doc.httpConfig?.successStatus,
        successJsonPath:
          payload.httpConfig.successJsonPath ?? doc.httpConfig?.successJsonPath,
        successEquals:
          payload.httpConfig.successEquals ?? doc.httpConfig?.successEquals,
        autoCompleteOnSuccess:
          payload.httpConfig.autoCompleteOnSuccess ??
          doc.httpConfig?.autoCompleteOnSuccess ??
          true,
        maxAttempts:
          payload.httpConfig.maxAttempts ?? doc.httpConfig?.maxAttempts ?? 1
      } as any
    }
    // Nếu đổi về manual thì clear httpConfig
    if (payload.type === "manual") {
      doc.httpConfig = undefined
    }
    await doc.save()
    return doc.toObject()
  }
  async deleteDefinition(code: string): Promise<{ deleted: boolean }> {
    const res = await this.roleTaskDefModel.deleteOne({ code })
    return { deleted: res.deletedCount === 1 }
  }

  async regenerate(
    date?: string
  ): Promise<{ date: string; tasksCreated: number }> {
    const targetDate = date ? new Date(date) : new Date()
    const result = await this.generateForDate(targetDate, { regenerate: true })
    return { date: result.date, tasksCreated: result.tasksCreated }
  }
}
