import { Document, model, Schema, Types } from "mongoose"

export type SalesLeadAssignmentKind = "initial" | "recycled" | "manual_transfer"
export type SalesLeadAssignmentStatus = "active" | "retained" | "recycled" | "transferred"

export interface SalesLeadAssignment extends Document {
  leadCaseId: Types.ObjectId
  salesCsId: Types.ObjectId
  assignedById: Types.ObjectId
  kind: SalesLeadAssignmentKind
  status: SalesLeadAssignmentStatus
  cycleKey?: string
  cycleStartAt: Date
  cycleEndAt?: Date
  startedAt: Date
  endedAt?: Date
  endReason?: "official" | "month_expired" | "manual_transfer"
  previousSalesCsId?: Types.ObjectId
  customerSnapshot: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export const SalesLeadAssignmentSchema = new Schema<SalesLeadAssignment>({
  leadCaseId: { type: Schema.Types.ObjectId, ref: "salesleadcases", required: true },
  salesCsId: { type: Schema.Types.ObjectId, ref: "users", required: true },
  assignedById: { type: Schema.Types.ObjectId, ref: "users", required: true },
  kind: { type: String, enum: ["initial", "recycled", "manual_transfer"], required: true },
  status: { type: String, enum: ["active", "retained", "recycled", "transferred"], required: true },
  cycleKey: String, cycleStartAt: { type: Date, required: true }, cycleEndAt: Date,
  startedAt: { type: Date, required: true }, endedAt: Date,
  endReason: { type: String, enum: ["official", "month_expired", "manual_transfer"] },
  previousSalesCsId: { type: Schema.Types.ObjectId, ref: "users" },
  customerSnapshot: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now }
})
SalesLeadAssignmentSchema.index({ leadCaseId: 1, status: 1 })
SalesLeadAssignmentSchema.index({ salesCsId: 1, status: 1, cycleEndAt: 1 })

export const SalesLeadAssignmentModel = model<SalesLeadAssignment>("SalesLeadAssignment", SalesLeadAssignmentSchema)
