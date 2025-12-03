import { Schema, Document, model, Types } from "mongoose"

export type SalesOrderStorage = "position_HaNam" | "position_MKT"

export type SalesOrderShippingType = "shipping_vtp" | "shipping_cargo"

export type SalesOrderStatus = "draft" | "official"

export interface SalesOrder extends Document {
  salesFunnelId: Types.ObjectId
  items: {
    code: string
    name: string
    price: number
    quantity: number
    area?: number
    mass?: number
    specification?: string
    size?: string
    note?: string
  }[]
  returning: boolean
  shippingCode?: string
  shippingType?: SalesOrderShippingType
  date: Date
  total: number
  orderDiscount: number
  otherDiscount: number
  deposit: number
  tax: number
  shippingCost: number
  storage: SalesOrderStorage
  status: SalesOrderStatus
  phoneNumber: string
  address: string
  province: {
    id: string
    name: string
  }
  createdAt: Date
  updatedAt: Date
}

export const SalesOrderSchema = new Schema<SalesOrder>({
  salesFunnelId: {
    type: Schema.Types.ObjectId,
    ref: "salesfunnel",
    required: true
  },
  shippingCode: { type: String, required: false },
  shippingType: {
    type: String,
    enum: ["shipping_vtp", "shipping_cargo"],
    required: false
  },
  items: [
    {
      code: { type: String, required: true },
      name: { type: String, required: true },
      price: { type: Number, required: true },
      quantity: { type: Number, required: true },
      area: { type: Number, required: false },
      mass: { type: Number, required: false },
      specification: { type: String, required: false },
      size: { type: String, required: false },
      note: { type: String, required: false }
    }
  ],
  returning: { type: Boolean, default: false, required: false },
  date: { type: Date, required: true },
  total: { type: Number, required: true },
  orderDiscount: { type: Number, required: true, default: 0 },
  otherDiscount: { type: Number, required: true, default: 0 },
  deposit: { type: Number, required: true, default: 0 },
  tax: { type: Number, required: true, default: 0 },
  shippingCost: { type: Number, required: true, default: 0 },
  storage: {
    type: String,
    enum: ["position_HaNam", "position_MKT"],
    required: true
  },
  status: {
    type: String,
    enum: ["draft", "official"],
    default: "draft",
    required: true
  },
  phoneNumber: { type: String, required: true },
  address: { type: String, required: true },
  province: {
    id: { type: String, required: true },
    name: { type: String, required: true }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesOrderModel = model<SalesOrder>("SalesOrder", SalesOrderSchema)
