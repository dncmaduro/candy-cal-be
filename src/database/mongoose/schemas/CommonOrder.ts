import { Schema, Document, model } from "mongoose"

export interface CommonOrder extends Document {
  products: {
    name: string
    quantity: number
  }[]
}

export const CommonOrderSchema: Schema<CommonOrder> = new Schema({
  products: [
    {
      name: { type: String, required: true },
      quantity: { type: Number, required: true }
    }
  ]
})

export const CommonOrderModel = model<CommonOrder>(
  "CommonOrder",
  CommonOrderSchema
)
