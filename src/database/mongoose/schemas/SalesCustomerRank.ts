import { Document, model, Schema, Types } from "mongoose"

export type Rank = "gold" | "silver" | "bronze"

export interface SalesCustomerRank extends Document {
  rank: Rank
  minIncome: number
}

export const SalesCustomerRankSchema = new Schema<SalesCustomerRank>({
  rank: {
    type: String,
    enum: ["gold", "silver", "bronze"],
    required: true
  },
  minIncome: { type: Number, required: true }
})

export const SalesCustomerRankModel = model<SalesCustomerRank>(
  "SalesCustomerRank",
  SalesCustomerRankSchema
)
