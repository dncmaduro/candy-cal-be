import { Document, Schema } from "mongoose"

export interface PermissionGroup extends Document {
  key: string
  label: string
  permissionKeys: string[]
  kind?: string
}

export const PermissionGroupSchema = new Schema<PermissionGroup>(
  {
    key: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    permissionKeys: { type: [String], required: true, default: [] },
    kind: { type: String }
  },
  { timestamps: true }
)
