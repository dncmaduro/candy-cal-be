import { Schema, Document, model } from "mongoose"

export interface User extends Document {
  username: string
  password: string
  name: string
  role: string
}

export const UserSchema = new Schema<User>({
  username: { type: String, required: true },
  password: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, required: true }
})

export const UserModel = model<User>("User", UserSchema)
