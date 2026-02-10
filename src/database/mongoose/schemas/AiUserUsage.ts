import { Schema, Document, model, Types } from "mongoose"

export interface AiUserUsage extends Document {
  userId: Types.ObjectId
  dateKey: string
  count: number
  createdAt: Date
  updatedAt: Date
}

export const AiUserUsageSchema = new Schema<AiUserUsage>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "users"
    },
    dateKey: { type: String, required: true, index: true },
    count: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
)

AiUserUsageSchema.index({ userId: 1, dateKey: 1 }, { unique: true })

export const AiUserUsageModel = model<AiUserUsage>(
  "AiUserUsage",
  AiUserUsageSchema
)
