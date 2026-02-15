import { Schema, Document, model, Types } from "mongoose"

export interface AiFeedback extends Document {
  userId: Types.ObjectId
  conversationId: string
  conversationObjectId?: Types.ObjectId
  description: string
  expected?: string
  actual?: string
  rating?: number
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export const AiFeedbackSchema = new Schema<AiFeedback>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "users"
    },
    conversationId: { type: String, required: true, index: true },
    conversationObjectId: {
      type: Schema.Types.ObjectId,
      required: false,
      ref: "aiconversations"
    },
    description: { type: String, required: true, trim: true },
    expected: { type: String, required: false, trim: true },
    actual: { type: String, required: false, trim: true },
    rating: { type: Number, required: false, min: 1, max: 5 },
    metadata: { type: Object, required: false, default: null }
  },
  { timestamps: true }
)

AiFeedbackSchema.index({ userId: 1, conversationId: 1, createdAt: -1 })

export const AiFeedbackModel = model<AiFeedback>(
  "AiFeedback",
  AiFeedbackSchema
)
