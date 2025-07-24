import { Document, model, Schema, Types } from "mongoose"

export interface MonthGoal {
  month: number
  year: number
  goal: number
}

export const MonthGoalSchema = new Schema<MonthGoal>({
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  goal: { type: Number, required: true }
})

export const MonthGoalModel = model<MonthGoal>("MonthGoal", MonthGoalSchema)
