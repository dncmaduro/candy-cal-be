import { Document, model, Schema, Types } from "mongoose"

export interface LivestreamSnapshotEmbedded {
  _id?: Types.ObjectId
  // snapshot of the period at the time of creating the snapshot
  period: {
    _id?: Types.ObjectId
    startTime: { hour: number; minute: number }
    endTime: { hour: number; minute: number }
    channel: string
    noon?: boolean
  }
  host?: Types.ObjectId
  assistant?: Types.ObjectId
  goal?: number
  income?: number
  noon?: boolean
}

export interface Livestream extends Document {
  date: Date
  snapshots: LivestreamSnapshotEmbedded[]
  totalOrders: number
  totalIncome: number
  ads: number
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
      noon: { type: Boolean, required: false }
    },
    host: {
      type: Schema.Types.ObjectId,
      ref: "LivestreamEmployee",
      required: false
    },
    assistant: {
      type: Schema.Types.ObjectId,
      ref: "LivestreamEmployee",
      required: false
    },
    goal: { type: Number, required: false },
    income: { type: Number, required: false },
    noon: { type: Boolean }
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
  ads: { type: Number, required: true, default: 0 }
})

export const LivestreamModel = model<Livestream>("Livestream", LivestreamSchema)
