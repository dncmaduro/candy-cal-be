import { Document, model, Schema, Types } from "mongoose"

export type SalesLeadCallOutcome = "no_answer" | "not_interested" | "call_back" | "considering" | "closed" | "wrong_number" | "other"
export interface SalesLeadCall extends Document {
  leadCaseId: Types.ObjectId; assignmentId: Types.ObjectId; salesCsId: Types.ObjectId
  calledAt: Date; outcome: SalesLeadCallOutcome; note: string; createdAt: Date; updatedAt: Date
}
export const SalesLeadCallSchema = new Schema<SalesLeadCall>({
  leadCaseId: { type: Schema.Types.ObjectId, ref: "salesleadcases", required: true },
  assignmentId: { type: Schema.Types.ObjectId, ref: "salesleadassignments", required: true },
  salesCsId: { type: Schema.Types.ObjectId, ref: "users", required: true },
  calledAt: { type: Date, required: true },
  outcome: { type: String, enum: ["no_answer", "not_interested", "call_back", "considering", "closed", "wrong_number", "other"], required: true },
  note: { type: String, required: true, trim: true },
  createdAt: { type: Date, default: Date.now }, updatedAt: { type: Date, default: Date.now }
})
SalesLeadCallSchema.index({ assignmentId: 1, calledAt: -1 })
export const SalesLeadCallModel = model<SalesLeadCall>("SalesLeadCall", SalesLeadCallSchema)
