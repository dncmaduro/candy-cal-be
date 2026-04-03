import { Document, model, Schema, Types } from "mongoose"

export interface DailyAdsV2 extends Document {
  date: Date
  internalAdsCost: number
  externalAdsCost: number
  updatedAt: Date
  before4pmInternalAdsCost?: number
  before4pmExternalAdsCost?: number
  channel?: Types.ObjectId
}

export const DailyAdsV2Schema = new Schema<DailyAdsV2>({
  date: { type: Date, required: true, unique: true },
  internalAdsCost: { type: Number, required: true, default: 0 },
  externalAdsCost: { type: Number, required: true, default: 0 },
  updatedAt: { type: Date, default: Date.now },
  before4pmInternalAdsCost: { type: Number, default: 0 },
  before4pmExternalAdsCost: { type: Number, default: 0 },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: false
  }
})

export const DailyAdsV2Model = model<DailyAdsV2>(
  "DailyAdsV2",
  DailyAdsV2Schema
)
