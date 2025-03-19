import { Schema, Document, model, Types } from "mongoose"

export interface ComboProduct {
  _id: Types.ObjectId // Reference to Product schema
  quantity: number
}

export interface Combo extends Document {
  name: string
  products: ComboProduct[]
  optional: boolean
}

const ComboProductSchema = new Schema<ComboProduct>({
  _id: { type: Schema.Types.ObjectId, ref: "Product", required: true }, // Reference to Product schema
  quantity: { type: Number, required: true }
})

export const ComboSchema = new Schema<Combo>({
  name: { type: String, required: true },
  products: { type: [ComboProductSchema], required: true },
  optional: { type: Boolean, required: false }
})

export const ComboModel = model<Combo>("Combo", ComboSchema)
