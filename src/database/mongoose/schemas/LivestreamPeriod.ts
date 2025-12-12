import { Document, model, Schema, Types } from "mongoose"

interface Time {
  hour: number
  minute: number
}

export interface LivestreamPeriod extends Document {
  startTime: Time
  endTime: Time
  channel: Types.ObjectId
  for: "host" | "assistant"
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
  channel: {
    type: Schema.Types.ObjectId,
    ref: "livestreamchannels",
    required: true
  },
  for: {
    type: String,
    enum: ["host", "assistant"],
    required: true
  }
})

export const LivestreamPeriodModel = model<LivestreamPeriod>(
  "LivestreamPeriod",
  LivestreamPeriodSchema
)
