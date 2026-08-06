import { Schema, Document, model, Types } from "mongoose"

export type SalesItemSource = "inside" | "outside"

export type SalesItemFactory =
  | "candy"
  | "manufacturing"
  | "position_MongCai"
  | "jelly"
  | "import"

export interface SalesItem extends Document {
  code?: string
  name: {
    vn: string
    cn?: string
  }
  size?: string
  area?: number
  specification?: string
  mass?: number
  price: number
  factory?: SalesItemFactory
  source?: SalesItemSource
  inventoryQuantity: number
  previousPeriodQuantity?: number
  lastImportedQuantity?: number
  currentPeriodExportedQuantity?: number
  inventoryUpdatedAt?: Date
  lastImportedAt?: Date
  createdAt: Date
  updatedAt: Date
}

export const SalesItemSchema = new Schema<SalesItem>({
  code: { type: String, required: false, unique: false },
  name: {
    vn: { type: String, required: true },
    cn: { type: String, required: false }
  },
  size: { type: String, required: false },
  area: { type: Number, required: false },
  specification: { type: String, required: false },
  price: { type: Number, required: false, default: 0 },
  mass: { type: Number, required: false },
  factory: {
    type: String,
    enum: ["candy", "manufacturing", "position_MongCai", "jelly", "import"],
    required: false
  },
  source: {
    type: String,
    enum: ["inside", "outside"],
    required: false
  },
  inventoryQuantity: { type: Number, required: true, default: 0, min: 0 },
  previousPeriodQuantity: { type: Number, required: false, min: 0 },
  lastImportedQuantity: { type: Number, required: false, min: 0 },
  currentPeriodExportedQuantity: { type: Number, required: false, min: 0 },
  inventoryUpdatedAt: { type: Date, required: false },
  lastImportedAt: { type: Date, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

SalesItemSchema.index({ code: 1 })

export const SalesItemModel = model<SalesItem>("SalesItem", SalesItemSchema)
