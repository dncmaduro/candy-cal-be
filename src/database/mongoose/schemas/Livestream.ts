import { Document, model, Schema, Types } from "mongoose"

export interface LivestreamSnapshotEmbedded {
  _id?: Types.ObjectId
  // snapshot of the period at the time of creating the snapshot
  period: {
    _id?: Types.ObjectId
    startTime: { hour: number; minute: number }
    endTime: { hour: number; minute: number }
    channel: string
    for: "host" | "assistant"
  }
  assignee?: Types.ObjectId
  income?: number
  adsCost?: number
  clickRate?: number
  avgViewingDuration?: number
  comments?: number
  ordersNote?: string
  rating?: string
  altAssignee?: Types.ObjectId | "other"
  altOtherAssignee?: string
  altNote?: string
  altRequest?: Types.ObjectId
}

export interface Livestream extends Document {
  date: Date
  snapshots: LivestreamSnapshotEmbedded[]
  totalOrders: number
  totalIncome: number
  ads: number
  fixed: boolean
}

export const LivestreamSnapshotSchema = new Schema<LivestreamSnapshotEmbedded>(
  {
    period: {
      _id: { type: Schema.Types.ObjectId, required: false },
      startTime: {
        hour: { type: Number, required: true },
        minute: { type: Number, required: true }
      },
      endTime: {
        hour: { type: Number, required: true },
        minute: { type: Number, required: true }
      },
      channel: { type: String, required: true },
      for: {
        type: String,
        enum: ["host", "assistant"],
        required: true
      }
    },
    assignee: {
      type: Schema.Types.ObjectId,
      ref: "users",
      required: false
    },
    income: { type: Number, required: false },
    adsCost: { type: Number, required: false },
    clickRate: { type: Number, required: false },
    avgViewingDuration: { type: Number, required: false },
    comments: { type: Number, required: false },
    ordersNote: { type: String, required: false },
    rating: { type: String, required: false },
    altAssignee: {
      type: Schema.Types.Mixed,
      required: false
    },
    altOtherAssignee: { type: String, required: false },
    altNote: { type: String, required: false }
  },
  { _id: true }
)

export const LivestreamSchema = new Schema<Livestream>({
  date: { type: Date, required: true },
  snapshots: {
    type: [LivestreamSnapshotSchema],
    required: true,
    default: []
  },
  totalOrders: { type: Number, required: true, default: 0 },
  totalIncome: { type: Number, required: true, default: 0 },
  ads: { type: Number, required: true, default: 0 },
  fixed: { type: Boolean, required: true, default: false }
})

export const LivestreamModel = model<Livestream>("Livestream", LivestreamSchema)
