import { Document, model, Schema } from "mongoose"

export interface Notification extends Document {
  title: string
  content: string
  createdAt: Date
  read: boolean
  viewed: boolean
  userId: string
  type: string
  link?: string
}

export const NotificationSchema = new Schema<Notification>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, required: true, default: Date.now },
  read: { type: Boolean, required: true, default: false },
  viewed: { type: Boolean, required: true, default: false },
  userId: { type: String, required: true },
  type: { type: String, required: true },
  link: { type: String, required: false }
})

export const NotificationModel = model<Notification>(
  "Notification",
  NotificationSchema
)
