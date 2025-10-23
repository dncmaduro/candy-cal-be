import { Schema, Document, model } from "mongoose"

export interface SalesChannel extends Document {
  channelName: string
  createdAt: Date
  updatedAt: Date
}

export const SalesChannelSchema = new Schema<SalesChannel>({
  channelName: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesChannelModel = model<SalesChannel>(
  "SalesChannel",
  SalesChannelSchema
)
