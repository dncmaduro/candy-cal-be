import { Schema, Document, model, Types } from "mongoose"

export interface ProductItem {
  _id: Types.ObjectId // Reference to Item schema
  quantity: number
}

export interface Product extends Document {
  name: string
  items: ProductItem[]
}

const ProductItemSchema = new Schema<ProductItem>({
  _id: { type: Schema.Types.ObjectId, ref: "Item", required: true }, // Reference to Item schema
  quantity: { type: Number, required: true }
})

export const ProductSchema = new Schema<Product>({
  name: { type: String, required: true },
  items: { type: [ProductItemSchema], required: true }
})

export const ProductModel = model<Product>("Product", ProductSchema)
