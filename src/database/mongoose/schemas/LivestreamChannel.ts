import { Document, model, Schema, Types } from "mongoose"

export interface LivestreamChannel extends Document {
  name: string
  username: string
  link: string
}

export const LivestreamChannelSchema = new Schema<LivestreamChannel>({
  name: { type: String, required: true },
  username: { type: String, required: true },
  link: { type: String, required: true }
})

export const LivestreamChannelModel = model<LivestreamChannel>(
  "LivestreamChannel",
  LivestreamChannelSchema
)
