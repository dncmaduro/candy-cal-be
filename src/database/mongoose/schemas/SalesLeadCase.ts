import { Document, model, Schema, Types } from "mongoose"

export type SalesLeadCaseStatus = "unassigned" | "assigned" | "pooled" | "retained"

export interface SalesLeadCase extends Document {
  salesFunnelId: Types.ObjectId
  hunterId: Types.ObjectId
  sourceChannelId?: Types.ObjectId
  status: SalesLeadCaseStatus
  currentAssignmentId?: Types.ObjectId
  firstOfficialOrderId?: Types.ObjectId
  firstOfficialAt?: Date
  createdAt: Date
  updatedAt: Date
}

export const SalesLeadCaseSchema = new Schema<SalesLeadCase>({
  salesFunnelId: { type: Schema.Types.ObjectId, ref: "salesfunnel", required: true, unique: true },
  hunterId: { type: Schema.Types.ObjectId, ref: "users", required: true },
  sourceChannelId: { type: Schema.Types.ObjectId, ref: "saleschannels", required: false },
  status: { type: String, enum: ["unassigned", "assigned", "pooled", "retained"], required: true },
  currentAssignmentId: { type: Schema.Types.ObjectId, ref: "salesleadassignments" },
  firstOfficialOrderId: { type: Schema.Types.ObjectId, ref: "salesorders" },
  firstOfficialAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
})
SalesLeadCaseSchema.index({ status: 1, updatedAt: -1 })

export const SalesLeadCaseModel = model<SalesLeadCase>("SalesLeadCase", SalesLeadCaseSchema)
