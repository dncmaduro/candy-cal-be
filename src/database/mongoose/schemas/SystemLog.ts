import { Document, model, Schema } from "mongoose"

export interface SystemLog extends Document {
  type: string
  action: string
  userId: string
  time: Date
}

export const SystemLogSchema = new Schema<SystemLog>({
  type: { type: String, required: true },
  action: { type: String, required: true },
  userId: { type: String, required: true },
  time: { type: Date, required: true, default: Date.now }
})

export const SystemLogModel = model<SystemLog>("SystemLog", SystemLogSchema)
