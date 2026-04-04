import { Document, model, Schema } from "mongoose"

export interface ShopeeChannel extends Document {
  name: string
  username: string
  usernames: string[]
  link: string
  platform: "shopee"
}

export const ShopeeChannelSchema = new Schema<ShopeeChannel>({
  name: { type: String, required: true },
  username: { type: String, required: true },
  usernames: { type: [String], default: [] },
  link: { type: String, required: true },
  platform: {
    type: String,
    enum: ["shopee"],
    required: true,
    default: "shopee"
  }
})

export const ShopeeChannelModel = model<ShopeeChannel>(
  "ShopeeChannel",
  ShopeeChannelSchema
)
