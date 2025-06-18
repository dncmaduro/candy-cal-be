import { model, Schema, Types } from "mongoose"

export interface DeliveredRequestItem {
  _id: Types.ObjectId // Reference to Item schema
  quantity: number
}

export interface DeliveredRequest {
  date: Date
  items: DeliveredRequestItem[]
  note?: string
  accepted?: boolean
  updatedAt?: Date
  comments?: {
    userId: string
    name: string
    text: string
    date: Date
  }[]
}

const DeliveredRequestItemSchema = new Schema<DeliveredRequestItem>({
  _id: { type: Schema.Types.ObjectId, ref: "Item", required: true }, // Reference to Item schema
  quantity: { type: Number, required: true }
})

export const DeliveredRequestSchema = new Schema<DeliveredRequest>({
  date: { type: Date, required: true },
  items: { type: [DeliveredRequestItemSchema], required: true },
  note: { type: String, required: false },
  accepted: { type: Boolean, required: false, default: false },
  updatedAt: { type: Date, default: Date.now },
  comments: [
    {
      userId: { type: String, required: true },
      name: { type: String, required: true },
      text: { type: String, required: true },
      date: { type: Date, default: Date.now }
    }
  ]
})

export const DeliveredRequestModel = model<DeliveredRequest>(
  "DeliveredRequest",
  DeliveredRequestSchema
)
