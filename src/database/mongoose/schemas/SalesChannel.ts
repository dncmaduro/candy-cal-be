import { Schema, Document, model, Types } from "mongoose"

export interface SalesChannel extends Document {
  channelName: string
  assignedTo?: Types.ObjectId
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

export const SalesChannelSchema = new Schema<SalesChannel>({
  channelName: { type: String, required: true, unique: true },
  assignedTo: {
    type: Schema.Types.ObjectId,
    ref: "users",
    required: false
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, required: false, default: null }
})

export const SalesChannelModel = model<SalesChannel>(
  "SalesChannel",
  SalesChannelSchema
)
