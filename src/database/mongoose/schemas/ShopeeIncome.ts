import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeIncome extends Document {
  date: Date
  orderId: string
  creator: string
  customer: string
  products: {
    code: string
    name: string
    quantity: number
    price: number
  }[]
  source: string
  total: number
  channel: Types.ObjectId
  affPercentage: number
}

export const ShopeeIncomeSchema = new Schema<ShopeeIncome>({
  date: { type: Date, required: true },
  orderId: { type: String, required: true },
  creator: { type: String, required: false, default: "" },
  customer: { type: String, required: false, default: "" },
  products: [
    {
      code: { type: String, required: true },
      name: { type: String, required: true },
      quantity: { type: Number, required: true },
      price: { type: Number, required: true }
    }
  ],
  source: { type: String, required: false, default: "" },
  total: { type: Number, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  affPercentage: { type: Number, required: false, default: 0 }
})

// Create compound unique index for orderId and channel
// This ensures that the same orderId can exist for different channels
// but cannot be duplicated within the same channel
ShopeeIncomeSchema.index({ orderId: 1, channel: 1 }, { unique: true })

export const ShopeeIncomeModel = model<ShopeeIncome>(
  "ShopeeIncome",
  ShopeeIncomeSchema
)
