import { Document, model, Schema, Types } from "mongoose"

export interface Income {
  orderId: string
  customer: string
  province: string
  date: Date
  products: {
    creator?: string
    code: string
    name: string
    source: "affiliate" | "affiliate-ads" | "ads" | "other"
    quantity: number
    quotation: number
    price: number
    affliateAdsPercentage?: number
    sourceChecked: boolean
    content?: string
    box?: string
  }[]
}

export const IncomeSchema = new Schema<Income>({
  orderId: { type: String, required: true },
  customer: { type: String, required: true },
  province: { type: String, required: true },
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
      affliateAdsPercentage: { type: Number, required: false },
      sourceChecked: { type: Boolean, required: true, default: false },
      content: { type: String, required: false },
      box: { type: String, required: false }
    }
  ]
})

export const IncomeModel = model<Income>("Income", IncomeSchema)
