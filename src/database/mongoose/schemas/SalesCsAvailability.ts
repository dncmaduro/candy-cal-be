import { Document, model, Schema, Types } from "mongoose"
export interface SalesCsAvailability extends Document { salesCsId: Types.ObjectId; isReceivingLeads: boolean; changedById: Types.ObjectId; changedAt: Date; note?: string }
export const SalesCsAvailabilitySchema = new Schema<SalesCsAvailability>({
  salesCsId: { type: Schema.Types.ObjectId, ref: "users", required: true, unique: true },
  isReceivingLeads: { type: Boolean, required: true, default: false },
  changedById: { type: Schema.Types.ObjectId, ref: "users", required: true },
  changedAt: { type: Date, required: true, default: Date.now }, note: String
})
export const SalesCsAvailabilityModel = model<SalesCsAvailability>("SalesCsAvailability", SalesCsAvailabilitySchema)
