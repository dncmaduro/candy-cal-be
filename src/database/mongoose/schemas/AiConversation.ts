import { Schema, Document, model, Types } from "mongoose"

export interface AiConversationMessage {
  role: "user" | "assistant"
  content: string
  createdAt: Date
}

export interface AiConversation extends Document {
  conversationId: string
  title?: string
  userId: Types.ObjectId
  messages: AiConversationMessage[]
  expireAt: Date
  createdAt: Date
  updatedAt: Date
}

const AiConversationMessageSchema = new Schema<AiConversationMessage>(
  {
    role: { type: String, required: true, enum: ["user", "assistant"] },
    content: { type: String, required: true },
    createdAt: { type: Date, required: true, default: Date.now }
  },
  { _id: false }
)

export const AiConversationSchema = new Schema<AiConversation>(
  {
    conversationId: { type: String, required: true, index: true },
    title: { type: String, default: "" },
    userId: {
      type: Schema.Types.ObjectId,
      required: true,
      index: true,
      ref: "users"
    },
    messages: { type: [AiConversationMessageSchema], default: [] },
    expireAt: { type: Date, required: true }
  },
  { timestamps: true }
)

AiConversationSchema.index({ userId: 1, conversationId: 1 }, { unique: true })
AiConversationSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 })

export const AiConversationModel = model<AiConversation>(
  "AiConversation",
  AiConversationSchema
)
