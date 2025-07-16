import { Document, model, Schema, Types } from "mongoose"

export interface ReadyComboProduct {
  _id: Types.ObjectId // Reference to Product schema
  quantity: number
}

export interface ReadyCombo extends Document {
  products: ReadyComboProduct[]
  isReady: boolean
  note?: string
}

const ReadyComboProductSchema = new Schema<ReadyComboProduct>({
  _id: { type: Schema.Types.ObjectId, ref: "Product", required: true }, // Reference to Product schema
  quantity: { type: Number, required: true }
})

export const ReadyComboSchema = new Schema<ReadyCombo>({
  products: { type: [ReadyComboProductSchema], required: true },
  isReady: { type: Boolean, default: false },
  note: { type: String, required: false }
})

export const ReadyComboModel = model<ReadyCombo>("ReadyCombo", ReadyComboSchema)
