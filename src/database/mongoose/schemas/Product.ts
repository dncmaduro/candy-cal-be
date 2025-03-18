import { Schema, Document, model } from "mongoose"

export interface ProductItem {
  _id: string
  quantity: number
}

export interface Product extends Document {
  name: string
  items: ProductItem[]
}

const ProductItemSchema = new Schema<ProductItem>({
  _id: { type: String, required: true },
  quantity: { type: Number, required: true }
})

export const ProductSchema = new Schema<Product>({
  name: { type: String, required: true },
  items: { type: [ProductItemSchema], required: true }
})

export const ProductModel = model<Product>("Product", ProductSchema)
