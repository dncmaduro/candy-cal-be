import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeMonthGoal extends Document {
  month: number
  year: number
  channel: Types.ObjectId
  income: number
}

export const ShopeeMonthGoalSchema = new Schema<ShopeeMonthGoal>({
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  income: { type: Number, required: true, default: 0 }
})

export const ShopeeMonthGoalModel = model<ShopeeMonthGoal>(
  "ShopeeMonthGoal",
  ShopeeMonthGoalSchema
)
