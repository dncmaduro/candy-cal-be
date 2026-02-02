import { Document, model, Schema, Types } from "mongoose"

export interface DailyLogItem {
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

export interface DailyLogProduct {
  name: string
  quantity: number
}

export interface DailyLogOrder {
  products: DailyLogProduct[]
  quantity: number
}

export interface DailyLog extends Document {
  date: Date
  channel?: Types.ObjectId
  items: DailyLogItem[]
  orders: DailyLogOrder[]
  updatedAt: Date
}

export const DailyLogSchema = new Schema<DailyLog>({
  date: { type: Date, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: false
  },
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
          quantity: { type: Number, required: true }
        }
      ],
      quantity: { type: Number, required: true }
    }
  ],
  updatedAt: { type: Date, default: Date.now }
})

DailyLogSchema.index({ date: 1, channel: 1 }, { unique: true })

export const DailyLogModel = model<DailyLog>("DailyLog", DailyLogSchema)
export default DailyLogModel
