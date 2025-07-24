import { Document, model, Schema, Types } from "mongoose"

export interface PackingRule {
  productCode: string
  requirements: {
    minQuantity: number | null
    maxQuantity: number | null
    packingType: string
  }[]
}

export const PackingRuleSchema = new Schema<PackingRule>({
  productCode: { type: String, required: true, unique: true },
  requirements: [
    {
      minQuantity: { type: Number, required: false, default: null },
      maxQuantity: { type: Number, required: false, default: null },
      packingType: { type: String, required: true }
    }
  ]
})

export const PackingRuleModel = model<PackingRule>(
  "PackingRule",
  PackingRuleSchema
)
