import { Document, model, Schema, Types } from "mongoose"

export type SalesInventoryLogType = "import" | "export"

export interface SalesInventoryLog extends Document {
  code: string
  itemId: Types.ObjectId
  type: SalesInventoryLogType
  quantity: number
  quantityBefore: number
  quantityAfter: number
  warehouse?: string
  salesOrderId?: Types.ObjectId
  salesInventoryPeriodId?: Types.ObjectId
  uploadBatchId?: string
  createdBy?: Types.ObjectId
  date: Date
  createdAt: Date
}

export const SalesInventoryLogSchema = new Schema<SalesInventoryLog>({
  code: { type: String, required: true, index: true },
  itemId: {
    type: Schema.Types.ObjectId,
    ref: "salesitems",
    required: true,
    index: true
  },
  type: { type: String, enum: ["import", "export"], required: true },
  quantity: { type: Number, required: true, min: 1 },
  quantityBefore: { type: Number, required: true, min: 0 },
  quantityAfter: { type: Number, required: true, min: 0 },
  warehouse: { type: String, required: false },
  salesOrderId: {
    type: Schema.Types.ObjectId,
    ref: "salesorders",
    required: false,
    index: true
  },
  salesInventoryPeriodId: {
    type: Schema.Types.ObjectId,
    ref: "salesinventoryperiods",
    required: false
  },
  uploadBatchId: { type: String, required: false, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "users", required: false },
  date: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now }
})

SalesInventoryLogSchema.index({ code: 1, date: -1 })
SalesInventoryLogSchema.index({ date: 1, type: 1 })

export const SalesInventoryLogModel = model<SalesInventoryLog>(
  "SalesInventoryLog",
  SalesInventoryLogSchema
)
