import { model, Schema, Types, Document } from "mongoose"

export interface LogItem {
  _id: Types.ObjectId
  quantity: number
}

export interface LogProduct {
  name: string
  quantity: number
}

export interface LogOrder {
  products: LogProduct[]
  quantity: number
}

export interface Log extends Document {
  date: Date
  items: LogItem[]
  orders: LogOrder[]
  updatedAt: Date
}

export const LogSchema = new Schema<Log>({
  date: { type: Date, required: true, unique: true },
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

export const LogModel = model<Log>("Log", LogSchema)
