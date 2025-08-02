import { Document, model, Schema, Types } from "mongoose"

export interface SessionLogItem {
  _id: Types.ObjectId
  quantity: number
}

export interface SessionLogProduct {
  name: string
  quantity: number
}

export interface SessionLogOrder {
  products: SessionLogProduct[]
  quantity: number
}

export interface SessionLog extends Document {
  time: Date
  items: SessionLogItem[]
  orders: SessionLogOrder[]
  updatedAt: Date
}

export const SessionLogSchema = new Schema<SessionLog>({
  time: { type: Date, required: true },
  items: [
    {
      _id: { type: Schema.Types.ObjectId, ref: "Item", required: true },
      quantity: { type: Number, required: true }
    }
  ],
  orders: [
    {
      products: [
        {
          name: { type: String, required: true },
          quantity: { type: Number, required: true }
        }
      ],
      quantity: { type: Number, required: true }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
})

export const SessionLogModel = model<SessionLog>("SessionLog", SessionLogSchema)
