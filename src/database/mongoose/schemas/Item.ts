import { Schema, Document, model } from "mongoose"

export interface Item extends Document {
  code: string
  name: string
  receivedQuantity: {
    quantity: number
    real: number
  }
  deliveredQuantity: {
    quantity: number
    real: number
  }
  restQuantity: {
    quantity: number
    real: number
  }
  note?: string
}

export const ItemSchema = new Schema<Item>({
  code: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  note: { type: String, required: false },
  receivedQuantity: {
    quantity: { type: Number, required: true, default: 0 },
    real: { type: Number, required: true, default: 0 }
  },
  deliveredQuantity: {
    quantity: { type: Number, required: true, default: 0 },
    real: { type: Number, required: true, default: 0 }
  },
  restQuantity: {
    quantity: { type: Number, required: true, default: 0 },
    real: { type: Number, required: true, default: 0 }
  }
})

export const ItemModel = model<Item>("Item", ItemSchema)
