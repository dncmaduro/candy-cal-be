import { Schema, Document, model, Types } from "mongoose"

export interface ProductItem {
  _id: Types.ObjectId // Reference to StorageItem schema (simplified from Item)
  quantity: number
}

export interface Product extends Document {
  name: string
  items: ProductItem[]
  deletedAt?: Date
}

const ProductItemSchema = new Schema<ProductItem>({
  _id: { type: Schema.Types.ObjectId, ref: "StorageItem", required: true }, // Reference to StorageItem schema directly
  quantity: { type: Number, required: true }
})

export const ProductSchema = new Schema<Product>({
  name: { type: String, required: true },
  items: { type: [ProductItemSchema], required: true },
  deletedAt: { type: Date, required: false, default: null }
})

export const ProductModel = model<Product>("Product", ProductSchema)
