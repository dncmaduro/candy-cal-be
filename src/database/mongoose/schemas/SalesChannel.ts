import { Schema, Document, model } from "mongoose"

export interface SalesChannel extends Document {
  channelName: string
  channelId: string
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

export const SalesChannelSchema = new Schema<SalesChannel>({
  channelName: { type: String, required: true, unique: true },
  channelId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, required: false, default: null }
})

export const SalesChannelModel = model<SalesChannel>(
  "SalesChannel",
  SalesChannelSchema
)
