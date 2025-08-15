import { Schema, Document, model } from "mongoose"

export interface ApiEndpoint extends Document {
  key: string
  name: string
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
  url: string
  headers?: Record<string, string>
  description?: string
  active: boolean
  deleted: boolean
  createdAt: Date
  updatedAt: Date
}

export const ApiEndpointSchema = new Schema<ApiEndpoint>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    method: { type: String, required: true },
    url: { type: String, required: true },
    headers: { type: Object, required: false },
    description: { type: String, required: false },
    active: { type: Boolean, required: true, default: true },
    deleted: { type: Boolean, required: true, default: false }
  },
  { timestamps: true }
)

ApiEndpointSchema.index({ key: 1 }, { unique: true })

export const ApiEndpointModel = model<ApiEndpoint>(
  "ApiEndpoint",
  ApiEndpointSchema
)
