import { Document, model, Schema, Types } from "mongoose"

export interface PackingRule extends Document {
  products: {
    productCode: string
    minQuantity: number | null
    maxQuantity: number | null
  }[]
  packingType: string
}

export const PackingRuleSchema = new Schema<PackingRule>({
  products: [
    {
      productCode: { type: String, required: true },
      minQuantity: { type: Number, required: false, default: null },
      maxQuantity: { type: Number, required: false, default: null }
    }
  ],
  packingType: { type: String, required: true }
})

export const PackingRuleModel = model<PackingRule>(
  "PackingRule",
  PackingRuleSchema
)
