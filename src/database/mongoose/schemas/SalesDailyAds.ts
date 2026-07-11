import { Document, model, Schema } from "mongoose"

/**
 * Sales ads cost is a company-wide daily metric, not a per-channel metric.
 */
export interface SalesDailyAds extends Document {
  date: Date
  adsCost: number
  createdAt: Date
  updatedAt: Date
}

export const SalesDailyAdsSchema = new Schema<SalesDailyAds>({
  date: { type: Date, required: true },
  adsCost: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

SalesDailyAdsSchema.index({ date: 1 }, { unique: true })

export const SalesDailyAdsModel = model<SalesDailyAds>(
  "SalesDailyAds",
  SalesDailyAdsSchema
)
