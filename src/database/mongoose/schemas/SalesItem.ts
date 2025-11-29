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
    cn: string
  }
  size?: string
  area?: number
  specification?: string
  mass?: number
  price: number
  factory?: SalesItemFactory
  source?: SalesItemSource
  createdAt: Date
  updatedAt: Date
}

export const SalesItemSchema = new Schema<SalesItem>({
  code: { type: String, required: false, unique: false },
  name: {
    vn: { type: String, required: true },
    cn: { type: String, required: true }
  },
  size: { type: String, required: false },
  area: { type: Number, required: false },
  specification: { type: String, required: false },
  price: { type: Number, required: true },
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesItemModel = model<SalesItem>("SalesItem", SalesItemSchema)
