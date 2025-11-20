import { Schema, Document, model, Types } from "mongoose"

export type SalesActivityType = "call" | "message" | "other"

export interface SalesActivity extends Document {
  time: Date
  type: SalesActivityType
  note: string
  salesFunnelId: Types.ObjectId
  createdAt: Date
  updatedAt: Date
}

export const SalesActivitySchema = new Schema<SalesActivity>({
  time: { type: Date, required: true },
  type: {
    type: String,
    enum: ["call", "message", "other"],
    required: true
  },
  note: { type: String, required: false },
  salesFunnelId: {
    type: Schema.Types.ObjectId,
    ref: "salesfunnel",
    required: true
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesActivityModel = model<SalesActivity>(
  "SalesActivity",
  SalesActivitySchema
)
