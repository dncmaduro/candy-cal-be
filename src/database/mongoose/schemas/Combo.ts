import { Schema, Document, model } from "mongoose"

export interface ComboProduct {
  _id: string
  quantity: number
}

export interface Combo extends Document {
  name: string
  products: ComboProduct[]
}

const ComboProductSchema = new Schema<ComboProduct>({
  _id: { type: String, required: true },
  quantity: { type: Number, required: true }
})

export const ComboSchema = new Schema<Combo>({
  name: { type: String, required: true },
  products: { type: [ComboProductSchema], required: true }
})

export const ComboModel = model<Combo>("Combo", ComboSchema)
