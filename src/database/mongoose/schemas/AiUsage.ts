import { Schema, Document, model } from "mongoose"

export interface AiUsage extends Document {
  monthKey: string
  inputTokens: number
  outputTokens: number
  totalCost: number
  createdAt: Date
  updatedAt: Date
}

export const AiUsageSchema = new Schema<AiUsage>(
  {
    monthKey: { type: String, required: true, unique: true, index: true },
    inputTokens: { type: Number, required: true, default: 0 },
    outputTokens: { type: Number, required: true, default: 0 },
    totalCost: { type: Number, required: true, default: 0 }
  },
  { timestamps: true }
)

export const AiUsageModel = model<AiUsage>("AiUsage", AiUsageSchema)
