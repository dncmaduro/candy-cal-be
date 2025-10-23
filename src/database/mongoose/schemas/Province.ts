import { Schema, Document, model } from "mongoose"

export interface Province extends Document {
  name: string
  code: string
  createdAt: Date
  updatedAt: Date
}

export const ProvinceSchema = new Schema<Province>({
  name: { type: String, required: true, unique: true },
  code: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const ProvinceModel = model<Province>("Province", ProvinceSchema)
