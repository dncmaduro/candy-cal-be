import { Document, model, Schema, Types } from "mongoose"

export interface OrderLogItem {
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

export interface OrderLogProduct {
  name: string
  quantity: number
}

export interface OrderLogOrder {
  products: OrderLogProduct[]
  quantity: number
}

export interface OrderLogSession {
  items: OrderLogItem[]
  orders: OrderLogOrder[]
}

export interface OrderLog extends Document {
  morning: OrderLogSession
  afternoon?: OrderLogSession
  date: Date
  updatedAt: Date
}

export const OrderLogSchema = new Schema<OrderLog>({
  morning: {
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
    ]
  },
  afternoon: {
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
    ]
  },
  date: { type: Date, required: true, unique: true },
  updatedAt: { type: Date, default: Date.now }
})

export const OrderLogModel = model<OrderLog>("OrderLog", OrderLogSchema)
