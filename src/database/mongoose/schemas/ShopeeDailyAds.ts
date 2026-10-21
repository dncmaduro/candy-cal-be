import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeDailyAds extends Document {
  date: Date
  channel: Types.ObjectId
  adsCost: number
  adsCostBeforeCancellation?: number
  adsCostAfterCancellation?: number
}

export const ShopeeDailyAdsSchema = new Schema<ShopeeDailyAds>({
  date: { type: Date, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  adsCost: { type: Number, required: true, default: 0 },
  adsCostBeforeCancellation: { type: Number, required: false },
  adsCostAfterCancellation: { type: Number, required: false }
})

ShopeeDailyAdsSchema.index({ channel: 1, date: 1 }, { unique: true })

export const ShopeeDailyAdsModel = model<ShopeeDailyAds>(
  "ShopeeDailyAds",
  ShopeeDailyAdsSchema
)
