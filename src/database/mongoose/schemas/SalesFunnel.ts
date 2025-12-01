import { Schema, Document, model, Types } from "mongoose"

export type SalesFunnelStage = "lead" | "contacted" | "customer" | "closed"

export type SalesFunnelSource = "ads" | "seeding" | "referral"

export interface SalesFunnel extends Document {
  psid?: string
  name: string
  province?: Types.ObjectId // Reference to Province schema
  phoneNumber?: string // Primary phone number
  secondaryPhoneNumbers?: string[] // Optional secondary phone numbers
  address?: string
  channel: Types.ObjectId // Reference to SalesChannel schema
  user: Types.ObjectId // Reference to User schema
  hasBuyed: boolean
  stage: SalesFunnelStage
  cost?: number
  updateStageLogs: {
    stage: SalesFunnelStage
    updatedAt: Date
  }[]
  funnelSource: SalesFunnelSource
  fromSystem?: boolean
  createdAt: Date
  updatedAt: Date
}

export const SalesFunnelSchema = new Schema<SalesFunnel>({
  psid: { type: String, required: false, unique: true, sparse: true },
  name: { type: String, required: true },
  province: {
    type: Schema.Types.ObjectId,
    ref: "provinces",
    required: false
  }, // Reference to Province schema
  phoneNumber: { type: String, required: false }, // Primary phone number
  secondaryPhoneNumbers: { type: [String], required: false, default: [] }, // Secondary phone numbers
  address: { type: String, required: false },
  channel: {
    type: Schema.Types.ObjectId,
    ref: "saleschannels",
    required: true
  }, // Reference to SalesChannel schema
  user: {
    type: Schema.Types.ObjectId,
    ref: "users",
    required: true
  }, // Reference to User schema
  hasBuyed: { type: Boolean, required: false },
  stage: {
    type: String,
    enum: ["lead", "contacted", "customer", "closed"],
    default: "lead"
  },
  cost: { type: Number, default: 0, required: false },
  updateStageLogs: [
    {
      stage: {
        type: String,
        enum: ["lead", "contacted", "customer", "closed"],
        required: true
      },
      updatedAt: { type: Date, required: true }
    }
  ],
  funnelSource: {
    type: String,
    enum: ["ads", "seeding", "referral"],
    default: "ads"
  },
  fromSystem: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})

export const SalesFunnelModel = model<SalesFunnel>(
  "SalesFunnel",
  SalesFunnelSchema
)
