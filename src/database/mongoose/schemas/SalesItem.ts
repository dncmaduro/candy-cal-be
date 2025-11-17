import { Schema, Document, model, Types } from "mongoose"

export type SalesItemSource = "inside" | "outside"

export type SalesItemFactory =
  | "candy"
  | "manufacturing"
  | "position_MongCai"
  | "jelly"
  | "import"

export interface SalesItem extends Document {
  code: string
  name: {
    vn: string
    cn: string
  }
  factory: SalesItemFactory
  price: number
  source: SalesItemSource
  specification: number // Quy cách: số lượng chiếc/đơn vị
  createdAt: Date
  updatedAt: Date
}

export const SalesItemSchema = new Schema<SalesItem>({
  code: { type: String, required: true, unique: true },
  name: {
    vn: { type: String, required: true },
    cn: { type: String, required: true }
  },
  factory: {
    type: String,
    enum: ["candy", "manufacturing", "position_MongCai", "jelly", "import"],
    required: true
  },
  price: { type: Number, required: true },
  source: {
    type: String,
    enum: ["inside", "outside"],
    required: true
  },
  specification: { type: Number, required: true, default: 1 }, // Quy cách: số lượng chiếc/đơn vị
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesItemModel = model<SalesItem>("SalesItem", SalesItemSchema)
