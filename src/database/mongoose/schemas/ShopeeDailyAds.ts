import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeDailyAds extends Document {
  date: Date
  channel: Types.ObjectId
  adsCost: number
}

export const ShopeeDailyAdsSchema = new Schema<ShopeeDailyAds>({
  date: { type: Date, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  adsCost: { type: Number, required: true, default: 0 }
})

ShopeeDailyAdsSchema.index({ channel: 1, date: 1 }, { unique: true })

export const ShopeeDailyAdsModel = model<ShopeeDailyAds>(
  "ShopeeDailyAds",
  ShopeeDailyAdsSchema
)
