import { Document, model, Schema, Types } from "mongoose"

export interface DailyAds extends Document {
  date: Date
  liveAdsCost: number
  videoAdsCost: number
  updatedAt: Date
}

export const DailyAdsSchema = new Schema<DailyAds>({
  date: { type: Date, required: true, unique: true },
  liveAdsCost: { type: Number, required: true, default: 0 },
  videoAdsCost: { type: Number, required: true, default: 0 },
  updatedAt: { type: Date, default: Date.now }
})

export const DailyAdsModel = model<DailyAds>("DailyAds", DailyAdsSchema)
