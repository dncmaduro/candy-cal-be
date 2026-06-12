import { Document, model, Schema, Types } from "mongoose"

export interface Income {
  orderId: string
  customer: string
  province: string
  shippingProvider?: string
  orderStatus?: string
  orderSubstatus?: string
  cancelationOrReturnType?: string
  orderRefundAmount?: number
  channel: Types.ObjectId
  date: Date
  products: {
    creator?: string
    code: string
    name: string
    source: "affiliate" | "affiliate-ads" | "ads" | "other"
    quantity: number
    quotation: number
    price: number
    platformDiscount?: number
    sellerDiscount?: number
    priceAfterDiscount?: number
    affiliateAdsPercentage?: number
    affiliateAdsAmount?: number
    sourceChecked: boolean
    content?: string
    box?: string
    standardAffPercentage?: number
    standardAffAmount?: number
  }[]
}

export const IncomeSchema = new Schema<Income>({
  orderId: { type: String, required: true },
  customer: { type: String, required: true },
  province: { type: String, required: true },
  shippingProvider: { type: String, required: false },
  orderStatus: { type: String, required: false },
  orderSubstatus: { type: String, required: false },
  cancelationOrReturnType: { type: String, required: false },
  orderRefundAmount: { type: Number, required: false, default: 0 },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  date: { type: Date, required: true },
  products: [
    {
      creator: { type: String, required: false },
      code: { type: String, required: true },
      name: { type: String, required: true },
      source: { type: String, required: true },
      quantity: { type: Number, required: true },
      quotation: { type: Number, required: true },
      price: { type: Number, required: true },
      platformDiscount: { type: Number, required: false },
      sellerDiscount: { type: Number, required: false },
      priceAfterDiscount: { type: Number, required: false },
      affiliateAdsPercentage: { type: Number, required: false },
      affiliateAdsAmount: { type: Number, required: false },
      sourceChecked: { type: Boolean, required: true, default: false },
      content: { type: String, required: false },
      box: { type: String, required: false },
      standardAffPercentage: { type: Number, required: false },
      standardAffAmount: { type: Number, required: false }
    }
  ]
})

IncomeSchema.index({ channel: 1, date: 1 })

export const IncomeModel = model<Income>("Income", IncomeSchema)
