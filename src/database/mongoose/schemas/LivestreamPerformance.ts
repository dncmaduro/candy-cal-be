import { Document, model, Schema, Types } from "mongoose"

export interface LivestreamPerformance extends Document {
  minIncome: number
  maxIncome: number
  salaryPerHour: number
  bonusPercentage: number
}

export const LivestreamPerformanceSchema = new Schema<LivestreamPerformance>({
  minIncome: { type: Number, required: true, default: 0 },
  maxIncome: { type: Number, required: true, default: 0 },
  salaryPerHour: { type: Number, required: true, default: 0 },
  bonusPercentage: { type: Number, required: true, default: 0 }
})

export const LivestreamPerformanceModel = model<LivestreamPerformance>(
  "LivestreamPerformance",
  LivestreamPerformanceSchema
)
