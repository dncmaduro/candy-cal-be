import { Document, model, Schema, Types } from "mongoose"

export interface DailyAds extends Document {
  date: Date
  liveAdsCost: number
  shopAdsCost: number
  updatedAt: Date
  before4pmLiveAdsCost?: number
  before4pmShopAdsCost?: number
  channel?: Types.ObjectId
}

export const DailyAdsSchema = new Schema<DailyAds>({
  date: { type: Date, required: true, unique: true },
  liveAdsCost: { type: Number, required: true, default: 0 },
  shopAdsCost: { type: Number, required: true, default: 0 },
  updatedAt: { type: Date, default: Date.now },
  before4pmLiveAdsCost: { type: Number, default: 0 },
  before4pmShopAdsCost: { type: Number, default: 0 },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: false
  }
})

export const DailyAdsModel = model<DailyAds>("DailyAds", DailyAdsSchema)
