import { Document, model, Schema, Types } from "mongoose"

export interface SalesInventoryPeriod extends Document {
  itemId: Types.ObjectId
  code: string
  previousQuantity: number
  importedQuantity: number
  exportedQuantity: number
  currentQuantity: number
  warehouse?: string
  uploadBatchId: string
  createdBy?: Types.ObjectId
  importedAt: Date
  createdAt: Date
  updatedAt: Date
}

export const SalesInventoryPeriodSchema = new Schema<SalesInventoryPeriod>({
  itemId: {
    type: Schema.Types.ObjectId,
    ref: "salesitems",
    required: true,
    index: true
  },
  code: { type: String, required: true, index: true },
  previousQuantity: { type: Number, required: true, min: 0 },
  importedQuantity: { type: Number, required: true, min: 1 },
  exportedQuantity: { type: Number, required: true, default: 0, min: 0 },
  currentQuantity: { type: Number, required: true, min: 0 },
  warehouse: { type: String, required: false },
  uploadBatchId: { type: String, required: true, index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "users", required: false },
  importedAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

SalesInventoryPeriodSchema.index({ code: 1, importedAt: -1 })

export const SalesInventoryPeriodModel = model<SalesInventoryPeriod>(
  "SalesInventoryPeriod",
  SalesInventoryPeriodSchema
)
