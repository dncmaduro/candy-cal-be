import { Schema, Document, model } from "mongoose"

export interface User extends Document {
  username: string
  password: string
  name: string
  role: string
  avatarUrl?: string
}

export const UserSchema = new Schema<User>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, required: true },
  avatarUrl: { type: String, required: false }
})

export const UserModel = model<User>("User", UserSchema)
