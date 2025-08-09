import { Document, model, Schema } from "mongoose"

export interface SystemLog extends Document {
  type: string
  action: string
  userId: string
  time: Date
  entity?: string
  entityId?: string
  result?: "success" | "failed"
  meta?: Record<string, any>
  ip?: string
  userAgent?: string
}

export const SystemLogSchema = new Schema<SystemLog>({
  type: { type: String, required: true },
  action: { type: String, required: true },
  userId: { type: String, required: true },
  time: { type: Date, required: true, default: Date.now },
  entity: { type: String },
  entityId: { type: String },
  result: { type: String, enum: ["success", "failed"] },
  meta: { type: Schema.Types.Mixed },
  ip: { type: String },
  userAgent: { type: String }
})

// Indexes for faster queries
SystemLogSchema.index({ time: -1 })
SystemLogSchema.index({ userId: 1 })
SystemLogSchema.index({ type: 1 })
SystemLogSchema.index({ userId: 1, time: -1 })

export const SystemLogModel = model<SystemLog>("SystemLog", SystemLogSchema)
