import { Schema, Document, model } from "mongoose"

export interface User extends Document {
  username: string
  password: string
  name: string
  roles: string[]
  avatarUrl?: string
  isDeactivated: boolean
}

export const UserSchema = new Schema<User>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  roles: { type: [String], required: true, default: ["user"] },
  avatarUrl: { type: String, required: false },
  isDeactivated: { type: Boolean, required: true, default: false }
})

export const UserModel = model<User>("User", UserSchema)
