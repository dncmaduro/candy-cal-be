import { Injectable, Logger } from "@nestjs/common"
import { Cron } from "@nestjs/schedule"
import { DailyTasksService } from "./dailytasks.service"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { DailyUserTask } from "../database/mongoose/schemas/DailyUserTask"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { RequestAudit } from "../database/mongoose/schemas/RequestAudit"

@Injectable()
export class DailyTasksCron {
  private readonly logger = new Logger(DailyTasksCron.name)

  constructor(
    private readonly dailyTasksService: DailyTasksService,
    @InjectModel("DailyUserTask")
    private readonly dailyUserTaskModel: Model<DailyUserTask>,
    private readonly systemLogsService: SystemLogsService,
    @InjectModel("RequestAudit")
    private readonly auditModel: Model<RequestAudit>
  ) {}

  // 08:00 AM daily generate
  @Cron("0 0 8 * * *")
  async handleDailyGenerate() {
    try {
      const res = await this.dailyTasksService.generateForDate(new Date(), {
        regenerate: true
      })
      this.logger.log(
        `Daily tasks generated 08:00 date=${res.date} users=${res.users} created=${res.tasksCreated}`
      )
    } catch (e) {
      this.logger.error("Generate fail 08:00", e as any)
    }
  }

  // every minute: check RequestAudit to see if required endpoint was called by user after runAt
  @Cron("0 * * * * *")
  async handleHttpChecks() {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, "0")
    const mm = String(now.getMinutes()).padStart(2, "0")
    const hhmm = `${hh}:${mm}`
    const today = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`

    try {
      const docs = await this.dailyUserTaskModel
        .find({
          date: today,
          "tasks.type": "http",
          "tasks.status": "pending"
        })
        .exec()
      for (const doc of docs) {
        let changed = false
        for (const t of doc.tasks) {
          if (t.type === "http" && t.status === "pending" && t.http) {
            const runAt = t.http.runAt || "00:00"
            if (runAt > hhmm) continue // chưa tới giờ
            // derive endpoint key we expect to see in audit
            const endpointKey = t.http.endpointKey || ""
            if (!endpointKey) continue
            const found = await this.auditModel.exists({
              userId: new Types.ObjectId(doc.userId as any),
              date: today,
              endpointKey
            })
            if (found) {
              t.status = "done"
              t.completedAt = new Date()
              changed = true
              void this.systemLogsService.createSystemLog(
                {
                  type: "task",
                  action: "auto_completed",
                  entity: "daily_task",
                  result: "success",
                  meta: { code: t.code, endpointKey }
                },
                doc.userId.toString()
              )
            }
          }
        }
        if (changed) {
          // recompute summary
          const summary = { total: 0, done: 0, auto: 0, pending: 0, expired: 0 }
          for (const tt of doc.tasks) {
            summary.total++
            if (tt.status === "done") summary.done++
            else if (tt.status === "auto") summary.auto++
            else if (tt.status === "pending") summary.pending++
            else if (tt.status === "expired") summary.expired++
          }
          doc.summary = summary as any
          await doc.save()
        }
      }
    } catch (e) {
      this.logger.error("Http check cron error", e as any)
    }
  }

  // 11:59 PM daily expire
  @Cron("0 59 23 * * *")
  async handleExpireDay() {
    const now = new Date()
    const dateKey = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`
    try {
      const docs = await this.dailyUserTaskModel.find({ date: dateKey }).exec()
      for (const doc of docs) {
        let changed = false
        let expiredCount = 0
        for (const t of doc.tasks) {
          if (t.status === "pending") {
            t.status = "expired"
            expiredCount++
            changed = true
          }
        }
        if (changed) {
          // recompute summary
          const summary = { total: 0, done: 0, auto: 0, pending: 0, expired: 0 }
          ;(doc.tasks as any[]).forEach((tt) => {
            summary.total++
            if (tt.status === "done") summary.done++
            else if (tt.status === "auto") summary.auto++
            else if (tt.status === "pending") summary.pending++
            else if (tt.status === "expired") summary.expired++
          })
          doc.summary = summary as any
          await doc.save()
          if (expiredCount > 0) {
            void this.systemLogsService.createSystemLog(
              {
                type: "task",
                action: "expired_daily",
                entity: "daily_task",
                result: "success",
                meta: { date: dateKey, expired: expiredCount }
              },
              doc.userId.toString()
            )
          }
        }
      }
      this.logger.log(`Expired tasks job finished date=${dateKey}`)
    } catch (e) {
      this.logger.error("Expire tasks cron error", e as any)
    }
  }
}
