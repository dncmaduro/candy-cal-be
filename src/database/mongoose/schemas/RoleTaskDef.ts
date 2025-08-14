import { Schema, Document, model } from "mongoose"

export interface RoleTaskDef extends Document {
  code: string
  title: string
  roles: string[]
  active: boolean
  order: number
  autoComplete: boolean
  type: "manual" | "http"
  httpConfig?: {
    endpointKey: string
    runAt: string // HH:MM
    successStatus?: number
    successJsonPath?: string
    successEquals?: any
    autoCompleteOnSuccess: boolean
    maxAttempts: number
  }
  createdAt: Date
  updatedAt: Date
}

export const RoleTaskDefSchema = new Schema<RoleTaskDef>(
  {
    code: { type: String, required: true, unique: true },
    title: { type: String, required: true },
    roles: { type: [String], required: true },
    active: { type: Boolean, required: true, default: true },
    order: { type: Number, required: true, default: 0 },
    autoComplete: { type: Boolean, required: true, default: false },
    type: { type: String, required: true, default: "manual" },
    httpConfig: {
      endpointKey: { type: String, required: false },
      runAt: { type: String, required: false },
      successStatus: { type: Number, required: false },
      successJsonPath: { type: String, required: false },
      successEquals: { type: Schema.Types.Mixed, required: false },
      autoCompleteOnSuccess: { type: Boolean, required: false, default: true },
      maxAttempts: { type: Number, required: false, default: 1 }
    }
  },
  { timestamps: true }
)

RoleTaskDefSchema.index({ code: 1 }, { unique: true })

export const RoleTaskDefModel = model<RoleTaskDef>(
  "RoleTaskDef",
  RoleTaskDefSchema
)
