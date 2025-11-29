import { Schema, Document, model, Types } from "mongoose"

export interface SalesDailyReport extends Document {
  date: Date
  channel: Types.ObjectId
  adsCost: number
  dateKpi: number
  revenue: number
  newFunnelRevenue: number
  returningFunnelRevenue: number
  accumulatedRevenue: number
  accumulatedAdsCost: number
  accumulatedNewFunnelRevenue: number
  createdAt: Date
  updatedAt: Date
  deletedAt: Date
}

export const SalesDailyReportSchema = new Schema<SalesDailyReport>({
  date: { type: Date, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "saleschannels",
    required: true
  },
  adsCost: { type: Number, required: true, default: 0 },
  dateKpi: { type: Number, required: true, default: 0 },
  revenue: { type: Number, required: true, default: 0 },
  newFunnelRevenue: { type: Number, required: true, default: 0 },
  returningFunnelRevenue: { type: Number, required: true, default: 0 },
  accumulatedRevenue: { type: Number, required: true, default: 0 },
  accumulatedAdsCost: { type: Number, required: true, default: 0 },
  accumulatedNewFunnelRevenue: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, required: false, default: null }
})

// Create compound unique index on date + channel
SalesDailyReportSchema.index({ date: 1, channel: 1 }, { unique: true })

export const SalesDailyReportModel = model<SalesDailyReport>(
  "SalesDailyReport",
  SalesDailyReportSchema
)
