import { Schema, Document, model, Types } from "mongoose"

export type SalesTaskType = "call" | "message" | "other"

export interface SalesTask extends Document {
  salesFunnelId: Types.ObjectId
  type: SalesTaskType
  assigneeId: Types.ObjectId
  activityId?: Types.ObjectId
  note: string
  deadline: Date
  completed: boolean
  completedAt: Date
  createdAt: Date
  updatedAt: Date
}

export const SalesTaskSchema = new Schema<SalesTask>({
  salesFunnelId: {
    type: Schema.Types.ObjectId,
    ref: "salesfunnel",
    required: true
  },
  type: {
    type: String,
    enum: ["call", "message", "other"],
    required: true
  },
  assigneeId: {
    type: Schema.Types.ObjectId,
    ref: "users",
    required: true
  },
  activityId: {
    type: Schema.Types.ObjectId,
    ref: "salesactivities",
    required: false
  },
  note: { type: String, required: false },
  deadline: { type: Date, required: true },
  completed: { type: Boolean, default: false, required: true },
  completedAt: { type: Date, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesTaskModel = model<SalesTask>("SalesTask", SalesTaskSchema)
