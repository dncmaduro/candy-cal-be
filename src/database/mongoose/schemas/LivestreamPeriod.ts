import { Document, model, Schema, Types } from "mongoose"

interface Time {
  hour: number
  minute: number
}

export interface LivestreamPeriod extends Document {
  startTime: Time
  endTime: Time
  channel: string
  noon?: boolean
}

export const LivestreamPeriodSchema = new Schema<LivestreamPeriod>({
  startTime: {
    hour: { type: Number, required: true },
    minute: { type: Number, required: true }
  },
  endTime: {
    hour: { type: Number, required: true },
    minute: { type: Number, required: true }
  },
  channel: { type: String, required: true },
  noon: { type: Boolean, required: false }
})

export const LivestreamPeriodModel = model<LivestreamPeriod>(
  "LivestreamPeriod",
  LivestreamPeriodSchema
)
