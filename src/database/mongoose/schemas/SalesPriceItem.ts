import { Schema, Document, model, Types } from "mongoose"

export interface SalesPriceItem extends Document {
  itemId: Types.ObjectId // Reference to Item schema
  price: number
  createdAt: Date
  updatedAt: Date
  deletedAt?: Date
}

export const SalesPriceItemSchema = new Schema<SalesPriceItem>({
  itemId: {
    type: Schema.Types.ObjectId,
    ref: "Item",
    required: true,
    unique: true
  }, // Reference to Item schema
  price: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  deletedAt: { type: Date, required: false, default: null }
})

export const SalesPriceItemModel = model<SalesPriceItem>(
  "SalesPriceItem",
  SalesPriceItemSchema
)
