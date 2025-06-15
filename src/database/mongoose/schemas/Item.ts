import { Schema, Document, model } from "mongoose"

export interface Item extends Document {
  name: string
  note?: string
  variants: string[]
}

export const ItemSchema = new Schema<Item>({
  name: { type: String, required: true },
  note: { type: String, required: false },
  variants: { type: [String], required: true }
})

export const ItemModel = model<Item>("Item", ItemSchema)
