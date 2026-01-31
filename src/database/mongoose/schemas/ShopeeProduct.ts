import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeItem {
  _id: Types.ObjectId
  quantity: number
}

export interface ShopeeProduct extends Document {
  name: string
  items: ShopeeItem[]
  deletedAt?: Date
}

const ShopeeItemSchema = new Schema<ShopeeItem>({
  _id: { type: Schema.Types.ObjectId, ref: "StorageItem", required: true }, // Reference to Item schema
  quantity: { type: Number, required: true }
})

export const ShopeeProductSchema = new Schema<ShopeeProduct>({
  name: { type: String, required: true, unique: true },
  items: { type: [ShopeeItemSchema], required: true },
  deletedAt: { type: Date, required: false, default: null }
})

export const ShopeeProductModel = model<ShopeeProduct>(
  "ShopeeProduct",
  ShopeeProductSchema
)
