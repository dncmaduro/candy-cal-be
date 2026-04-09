import { Document, model, Schema, Types } from "mongoose"

export interface ShopeeMonthKpi extends Document {
  month: number
  year: number
  channel: Types.ObjectId
  revenueKpi: number
  adsCostKpi: number
  roasKpi: number
}

export const ShopeeMonthKpiSchema = new Schema<ShopeeMonthKpi>({
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  revenueKpi: { type: Number, required: true, default: 0 },
  adsCostKpi: { type: Number, required: true, default: 0 },
  roasKpi: { type: Number, required: true, default: 0 }
})

ShopeeMonthKpiSchema.index({ month: 1, year: 1, channel: 1 }, { unique: true })

export const ShopeeMonthKpiModel = model<ShopeeMonthKpi>(
  "ShopeeMonthKpi",
  ShopeeMonthKpiSchema
)
