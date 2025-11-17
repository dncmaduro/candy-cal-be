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
  }[]
  returning: boolean
  shippingCode?: string
  shippingType?: SalesOrderShippingType
  date: Date
  total: number
  discount: number
  deposit: number
  tax: number
  shippingCost: number
  storage: SalesOrderStorage
  status: SalesOrderStatus
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
      quantity: { type: Number, required: true }
    }
  ],
  returning: { type: Boolean, default: false, required: false },
  date: { type: Date, required: true },
  total: { type: Number, required: true },
  discount: { type: Number, required: true, default: 0 },
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
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesOrderModel = model<SalesOrder>("SalesOrder", SalesOrderSchema)
