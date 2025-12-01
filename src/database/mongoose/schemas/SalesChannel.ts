import { Schema, Document, model, Types } from "mongoose"

export interface SalesChannel extends Document {
  channelName: string
  assignedTo?: Types.ObjectId
  phoneNumber: string
  address: string
  avatarUrl: string
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
  phoneNumber: { type: String, required: true },
  address: { type: String, required: false },
  avatarUrl: { type: String, required: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, required: false, default: null }
})

export const SalesChannelModel = model<SalesChannel>(
  "SalesChannel",
  SalesChannelSchema
)
