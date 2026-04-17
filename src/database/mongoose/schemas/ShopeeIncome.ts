import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeIncomeProduct {
  variantSku: Types.ObjectId
  originalPrice: number
  sellerDiscount: number
  buyerPaidTotal: number
}

export interface ShopeeIncome extends Document {
  channel: Types.ObjectId
  orderId: string
  packageId: string
  orderDate: Date
  orderStatus: string
  cancelReason: string
  trackingNumber: string
  expectedDeliveryDate: Date | null
  shippedDate: Date | null
  deliveryTime: Date | null
  products: ShopeeIncomeProduct[]
  createdAt: Date
  updatedAt: Date
}

export const ShopeeIncomeProductSchema = new Schema<ShopeeIncomeProduct>(
  {
    variantSku: {
      type: Schema.Types.ObjectId,
      ref: "shopeeproducts",
      required: true
    },
    originalPrice: { type: Number, required: true, default: 0 },
    sellerDiscount: { type: Number, required: true, default: 0 },
    buyerPaidTotal: { type: Number, required: true, default: 0 }
  },
  { _id: false }
)

export const ShopeeIncomeSchema = new Schema<ShopeeIncome>({
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  orderId: { type: String, required: true },
  packageId: { type: String, required: false, default: "" },
  orderDate: { type: Date, required: true },
  orderStatus: { type: String, required: true, default: "" },
  cancelReason: { type: String, required: false, default: "" },
  trackingNumber: { type: String, required: false, default: "" },
  expectedDeliveryDate: { type: Date, required: false, default: null },
  shippedDate: { type: Date, required: false, default: null },
  deliveryTime: { type: Date, required: false, default: null },
  products: { type: [ShopeeIncomeProductSchema], required: true, default: [] }
}, {
  timestamps: true
})

ShopeeIncomeSchema.index({ orderId: 1, channel: 1 }, { unique: true })

export const ShopeeIncomeModel = model<ShopeeIncome>(
  "ShopeeIncome",
  ShopeeIncomeSchema
)
