import { Schema, Document, model, Types } from "mongoose"

export interface DailyUserTaskTask {
  code: string
  title: string
  status: "pending" | "done" | "auto" | "expired"
  completedAt?: Date
  type?: "manual" | "http"
  http?: {
    endpointKey: string
    method: string
    url: string
    runAt: string
    successStatus?: number
    successJsonPath?: string
    successEquals?: any
    autoCompleteOnSuccess: boolean
    maxAttempts: number
    attempts: number
    lastCheckAt?: Date
    lastResult?: "success" | "fail"
    message?: string
  }
}

export interface DailyUserTask extends Document {
  userId: Types.ObjectId
  date: string // yyyymmdd
  tasks: DailyUserTaskTask[]
  summary: {
    total: number
    done: number
    auto: number
    pending: number
    expired: number
  }
  createdAt: Date
  updatedAt: Date
}

export const DailyUserTaskSchema = new Schema<DailyUserTask>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "users", required: true },
    date: { type: String, required: true },
    tasks: [
      {
        code: { type: String, required: true },
        title: { type: String, required: true },
        status: { type: String, required: true, default: "pending" },
        completedAt: { type: Date, required: false },
        type: { type: String, required: false, default: "manual" },
        http: {
          endpointKey: { type: String, required: false },
          method: { type: String, required: false },
          url: { type: String, required: false },
          runAt: { type: String, required: false },
          successStatus: { type: Number, required: false },
          successJsonPath: { type: String, required: false },
          successEquals: { type: Schema.Types.Mixed, required: false },
          autoCompleteOnSuccess: { type: Boolean, required: false },
          maxAttempts: { type: Number, required: false },
          attempts: { type: Number, required: false, default: 0 },
          lastCheckAt: { type: Date, required: false },
          lastResult: { type: String, required: false },
          message: { type: String, required: false }
        }
      }
    ],
    summary: {
      total: { type: Number, required: true, default: 0 },
      done: { type: Number, required: true, default: 0 },
      auto: { type: Number, required: true, default: 0 },
      pending: { type: Number, required: true, default: 0 },
      expired: { type: Number, required: true, default: 0 }
    }
  },
  { timestamps: true }
)

DailyUserTaskSchema.index({ userId: 1, date: 1 }, { unique: true })
DailyUserTaskSchema.index({ date: 1 })

export const DailyUserTaskModel = model<DailyUserTask>(
  "DailyUserTask",
  DailyUserTaskSchema
)
