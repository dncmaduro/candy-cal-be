import { Document, model, Schema, Types } from "mongoose"

export interface LivestreamSalary extends Document {
  name: string
  livestreamPerformances: Types.ObjectId[]
  livestreamEmployees: Types.ObjectId[]
}

export const LivestreamSalarySchema = new Schema<LivestreamSalary>({
  name: {
    type: String,
    required: true,
    trim: true
  },
  livestreamPerformances: {
    type: [Schema.Types.ObjectId],
    ref: "livestreamperformance",
    required: true
  },
  livestreamEmployees: {
    type: [Schema.Types.ObjectId],
    ref: "users",
    required: true
  }
})

export const LivestreamSalaryModel = model<LivestreamSalary>(
  "LivestreamSalary",
  LivestreamSalarySchema
)
