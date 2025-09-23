import { Schema, Document, model, Types, Model } from "mongoose"

export interface StorageLogItem {
  _id: Types.ObjectId // Reference to Item schema
  quantity: number
}

export interface StorageLog extends Document {
  item?: StorageLogItem // Keep for backward compatibility with old data
  items?: StorageLogItem[] // New field for multiple items
  note?: string
  status: string
  date: Date
  tag?: string
  deliveredRequestId?: Types.ObjectId
}

export interface StorageLogModel extends Model<StorageLog> {
  createWithItems(
    items: StorageLogItem[],
    data: {
      note?: string
      status: string
      date: Date
      tag?: string
      deliveredRequestId?: Types.ObjectId
    }
  ): StorageLog
}

const StorageLogItemSchema = new Schema<StorageLogItem>({
  _id: { type: Schema.Types.ObjectId, ref: "Item", required: true }, // Reference to Item schema
  quantity: { type: Number, required: true }
})

export const StorageLogSchema = new Schema<StorageLog>({
  item: { type: StorageLogItemSchema, required: false }, // Keep for old data
  items: { type: [StorageLogItemSchema], required: false }, // New field for multiple items
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
