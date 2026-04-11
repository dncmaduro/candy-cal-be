import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeDailyLiveRevenue extends Document {
  date: Date
  channel: Types.ObjectId
  liveRevenue: number
}

export const ShopeeDailyLiveRevenueSchema = new Schema<ShopeeDailyLiveRevenue>({
  date: { type: Date, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  liveRevenue: { type: Number, required: true, default: 0 }
})

ShopeeDailyLiveRevenueSchema.index({ channel: 1, date: 1 }, { unique: true })

export const ShopeeDailyLiveRevenueModel = model<ShopeeDailyLiveRevenue>(
  "ShopeeDailyLiveRevenue",
  ShopeeDailyLiveRevenueSchema
)
