import { Schema, Document, model, Types } from "mongoose"

export interface StorageLogItem {
  _id: Types.ObjectId // Reference to Item schema
  quantity: number
}

export interface StorageLog extends Document {
  item: StorageLogItem
  note?: string
  status: string
  date: Date
  tag?: string
  deliveredRequestId?: Types.ObjectId
}

const StorageLogItemSchema = new Schema<StorageLogItem>({
  _id: { type: Schema.Types.ObjectId, ref: "Item", required: true }, // Reference to Item schema
  quantity: { type: Number, required: true }
})

export const StorageLogSchema = new Schema<StorageLog>({
  item: { type: StorageLogItemSchema, required: true },
  note: { type: String, required: false },
  status: { type: String, required: true },
  date: { type: Date, required: true },
  tag: { type: String, required: false },
  deliveredRequestId: {
    type: Schema.Types.ObjectId,
    ref: "DeliveredRequest",
    required: false
  }
})

export const StorageLogModel = model<StorageLog>("StorageLog", StorageLogSchema)
