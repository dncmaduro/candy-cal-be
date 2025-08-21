import { Document, model, Schema, Types } from "mongoose"

export interface MonthGoal extends Document {
  month: number
  year: number
  liveStreamGoal: number
  shopGoal: number
  liveAdsPercentageGoal: number
  shopAdsPercentageGoal: number
}

export const MonthGoalSchema = new Schema<MonthGoal>({
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  liveStreamGoal: { type: Number, required: true, default: 0 },
  shopGoal: { type: Number, required: true, default: 0 },
  liveAdsPercentageGoal: { type: Number, required: true, default: 0 },
  shopAdsPercentageGoal: { type: Number, required: true, default: 0 }
})

export const MonthGoalModel = model<MonthGoal>("MonthGoal", MonthGoalSchema)
