import { Document, model, Schema, Types } from "mongoose"

export interface LivestreamMonthGoal extends Document {
  month: number
  year: number
  channel: Types.ObjectId
  goal: number
}

export const LivestreamMonthGoalSchema = new Schema<LivestreamMonthGoal>({
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  goal: { type: Number, required: true, default: 0 }
})

export const LivestreamMonthGoalModel = model<LivestreamMonthGoal>(
  "LivestreamMonthGoal",
  LivestreamMonthGoalSchema
)
