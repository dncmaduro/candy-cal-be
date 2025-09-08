import { Document, model, Schema, Types } from "mongoose"

export interface LivestreamEmployee extends Document {
  name: string
  active?: boolean
}

export const LivestreamEmployeeSchema = new Schema<LivestreamEmployee>({
  name: { type: String, required: true },
  active: { type: Boolean, default: true }
})

export const LivestreamEmployeeModel = model<LivestreamEmployee>(
  "LivestreamEmployee",
  LivestreamEmployeeSchema
)
