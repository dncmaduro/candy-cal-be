import { Schema, Document, model, Types } from "mongoose"

export type SalesFunnelStage = "lead" | "contacted" | "customer" | "closed"

export interface SalesFunnel extends Document {
  name: string
  province: Types.ObjectId // Reference to Province schema
  phoneNumber: string
  channel: Types.ObjectId // Reference to SalesChannel schema
  userId: Types.ObjectId // Reference to User schema
  hasBuyed: boolean
  stage: SalesFunnelStage
  createdAt: Date
  updatedAt: Date
}

export const SalesFunnelSchema = new Schema<SalesFunnel>({
  name: { type: String, required: true },
  province: {
    type: Schema.Types.ObjectId,
    ref: "Province",
    required: true
  }, // Reference to Province schema
  phoneNumber: { type: String, required: true },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "SalesChannel",
    required: true
  }, // Reference to SalesChannel schema
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  }, // Reference to User schema
  hasBuyed: { type: Boolean, default: false },
  stage: {
    type: String,
    enum: ["lead", "contacted", "customer", "closed"],
    default: "lead"
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesFunnelModel = model<SalesFunnel>(
  "SalesFunnel",
  SalesFunnelSchema
)
