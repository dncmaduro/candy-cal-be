import { Schema, Document, model, Types } from "mongoose"

export interface RequestAudit extends Document {
  userId?: Types.ObjectId
  method: string
  path: string // normalized Nest path, e.g. /dailytasks/:code/done
  endpointKey: string // e.g. GET-_dailytasks__code_done
  date: string // yyyymmdd (local day)
  occurredAt: Date
  statusCode?: number
  meta?: Record<string, any>
  createdAt: Date
}

export const RequestAuditSchema = new Schema<RequestAudit>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "users", required: false },
    method: { type: String, required: true },
    path: { type: String, required: true },
    endpointKey: { type: String, required: true },
    date: { type: String, required: true },
    occurredAt: { type: Date, required: true, default: Date.now },
    statusCode: { type: Number, required: false },
    meta: { type: Schema.Types.Mixed, required: false }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

// TTL: auto delete after 90 days
RequestAuditSchema.index(
  { occurredAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 }
)
// Fast lookups
RequestAuditSchema.index({ userId: 1, date: 1, endpointKey: 1 })

export const RequestAuditModel = model<RequestAudit>(
  "RequestAudit",
  RequestAuditSchema
)
