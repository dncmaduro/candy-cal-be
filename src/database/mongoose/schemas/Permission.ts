import { Document, Schema } from "mongoose"

export interface Permission extends Document {
  key: string
  label: string
  description?: string
  module?: string
  source?: { method: string; path: string; handler: string }
}

export const PermissionSchema = new Schema<Permission>(
  {
    key: { type: String, required: true, unique: true, index: true },
    label: { type: String, required: true },
    description: { type: String },
    module: { type: String, index: true },
    source: {
      method: { type: String },
      path: { type: String },
      handler: { type: String }
    }
  },
  { timestamps: true }
)
