import { Document, model, Schema, Types } from "mongoose"

export interface DailyAdsMetrics extends Document {
  date: Date
  channel: Types.ObjectId
  roiProtect: number
  refundCancelRate: number
  fullRefundGmv: number
  tinRefundAmount: number
  adsTax: number
  gmvAds: number
  affiliateCost: number
  affiliateRefundAmount: number
  totalRevenue: number
  adjustedRevenue: number
  incomeBeforeDiscount: number
  incomeAfterDiscount: number
  actualAdsCost: number
  totalCost: number
  costAfterRefund: number
  adsRatioOnBeforeDiscountRevenue: number
  totalCostRatioOnBeforeDiscountRevenue: number
  costAfterRefundRatioOnBeforeDiscountRevenue: number
  affiliateRatioOnBeforeDiscountRevenue: number
  updatedAt: Date
}

export const DailyAdsMetricsSchema = new Schema<DailyAdsMetrics>({
  date: { type: Date, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  roiProtect: { type: Number, required: true, default: 0 },
  refundCancelRate: { type: Number, required: true, default: 0 },
  fullRefundGmv: { type: Number, required: true, default: 0 },
  tinRefundAmount: { type: Number, required: true, default: 0 },
  adsTax: { type: Number, required: true, default: 0 },
  gmvAds: { type: Number, required: true, default: 0 },
  affiliateCost: { type: Number, required: true, default: 0 },
  affiliateRefundAmount: { type: Number, required: true, default: 0 },
  totalRevenue: { type: Number, required: true, default: 0 },
  adjustedRevenue: { type: Number, required: true, default: 0 },
  incomeBeforeDiscount: { type: Number, required: true, default: 0 },
  incomeAfterDiscount: { type: Number, required: true, default: 0 },
  actualAdsCost: { type: Number, required: true, default: 0 },
  totalCost: { type: Number, required: true, default: 0 },
  costAfterRefund: { type: Number, required: true, default: 0 },
  adsRatioOnBeforeDiscountRevenue: { type: Number, required: true, default: 0 },
  totalCostRatioOnBeforeDiscountRevenue: {
    type: Number,
    required: true,
    default: 0
  },
  costAfterRefundRatioOnBeforeDiscountRevenue: {
    type: Number,
    required: true,
    default: 0
  },
  affiliateRatioOnBeforeDiscountRevenue: {
    type: Number,
    required: true,
    default: 0
  },
  updatedAt: { type: Date, default: Date.now }
})

DailyAdsMetricsSchema.index({ channel: 1, date: 1 }, { unique: true })

export const DailyAdsMetricsModel = model<DailyAdsMetrics>(
  "DailyAdsMetrics",
  DailyAdsMetricsSchema
)
