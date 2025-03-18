import { Schema, Document, model } from "mongoose"

export interface Item extends Document {
  name: string
  quantityPerBox: number
}

export const ItemSchema = new Schema<Item>({
  name: { type: String, required: true },
  quantityPerBox: { type: Number, required: true }
})

export const ItemModel = model<Item>("Item", ItemSchema)
