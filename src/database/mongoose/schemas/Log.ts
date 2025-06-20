import { model, Schema, Types, Document } from "mongoose"

export interface LogItem {
  _id: Types.ObjectId
  quantity: number
  storageItems: {
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
  }[]
}

export interface LogProduct {
  name: string
  quantity: number
  isReady: boolean
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
      quantity: { type: Number, required: true },
      storageItems: [
        {
          code: { type: String, required: true },
          name: { type: String, required: true },
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
          },
          note: { type: String, required: false }
        }
      ]
    }
  ],
  orders: [
    {
      products: [
        {
          name: { type: String, required: true },
          quantity: { type: Number, required: true },
          isReady: { type: Boolean, default: false }
        }
      ],
      quantity: { type: Number, required: true }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
})

export const LogModel = model<Log>("Log", LogSchema)
