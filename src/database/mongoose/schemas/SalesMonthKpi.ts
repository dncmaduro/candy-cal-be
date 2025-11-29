import { Schema, Document, model, Types } from "mongoose"

export interface SalesMonthKpi extends Document {
  month: number
  year: number
  channel: Types.ObjectId
  kpi: number
}

export const SalesMonthKpiSchema = new Schema<SalesMonthKpi>({
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "saleschannels",
    required: true
  },
  kpi: { type: Number, required: true, default: 0 }
})

export const SalesMonthKpiModel = model<SalesMonthKpi>(
  "SalesMonthKpi",
  SalesMonthKpiSchema
)
