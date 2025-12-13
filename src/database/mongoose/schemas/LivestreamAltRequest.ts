import { Document, model, Schema, Types } from "mongoose"

export type LivestreamAltRequestStatus = "pending" | "accepted" | "rejected"

export interface LivestreamAltRequest extends Document {
  createdBy: Types.ObjectId
  livestreamId: Types.ObjectId
  snapshotId: Types.ObjectId
  altNote: string
  status: LivestreamAltRequestStatus
  createdAt: Date
  updatedAt: Date
}

export const LivestreamAltRequestSchema = new Schema<LivestreamAltRequest>({
  createdBy: { type: Schema.Types.ObjectId, ref: "users", required: true },
  livestreamId: {
    type: Schema.Types.ObjectId,
    ref: "Livestream",
    required: true
  },
  snapshotId: { type: Schema.Types.ObjectId, required: true },
  altNote: { type: String, required: true },
  status: {
    type: String,
    enum: ["pending", "accepted", "rejected"],
    required: true,
    default: "pending"
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const LivestreamAltRequestModel = model<LivestreamAltRequest>(
  "LivestreamAltRequest",
  LivestreamAltRequestSchema
)
