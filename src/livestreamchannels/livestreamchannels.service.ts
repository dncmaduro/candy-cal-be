import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"

@Injectable()
export class LivestreamchannelsService {
  constructor(
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>
  ) {}

  async createLivestreamChannel(payload: {
    name: string
    username: string
    usernames?: string[]
    link: string
  }): Promise<LivestreamChannel> {
    try {
      const exists = await this.livestreamChannelModel
        .findOne({ username: payload.username })
        .exec()
      if (exists)
        throw new HttpException(
          "Channel already exists",
          HttpStatus.BAD_REQUEST
        )
      const normalizedUsernames = Array.from(
        new Set(
          (payload.usernames?.length ? payload.usernames : [payload.username])
            .map((name) => String(name || "").trim())
            .filter(Boolean)
        )
      )
      const created = new this.livestreamChannelModel({
        ...payload,
        usernames: normalizedUsernames
      })
      return await created.save()
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchLivestreamChannels(
    searchText?: string,
    page = 1,
    limit = 10
  ): Promise<{ data: LivestreamChannel[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)
      const filter: any = {}
      if (typeof searchText === "string" && searchText.trim() !== "") {
        const regex = new RegExp(searchText.trim(), "i")
        filter.$or = [{ name: regex }, { username: regex }, { usernames: regex }]
      }
      const [data, total] = await Promise.all([
        this.livestreamChannelModel
          .find(filter)
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .exec(),
        this.livestreamChannelModel.countDocuments(filter).exec()
      ])
      return { data, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getLivestreamChannelById(id: string): Promise<LivestreamChannel> {
    try {
      const doc = await this.livestreamChannelModel.findById(id).exec()
      if (!doc)
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
      return doc
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateLivestreamChannel(
    id: string,
    payload: {
      name?: string
      username?: string
      usernames?: string[]
      link?: string
    }
  ): Promise<LivestreamChannel> {
    try {
      const updateObj: any = {}
      if (typeof payload.name !== "undefined") updateObj.name = payload.name
      if (typeof payload.username !== "undefined")
        updateObj.username = payload.username
      if (typeof payload.usernames !== "undefined") {
        updateObj.usernames = Array.from(
          new Set(
            payload.usernames
              .map((name) => String(name || "").trim())
              .filter(Boolean)
          )
        )
      }
      if (typeof payload.link !== "undefined") updateObj.link = payload.link

      const updated = await this.livestreamChannelModel
        .findByIdAndUpdate(id, { $set: updateObj }, { new: true })
        .exec()
      if (!updated)
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
      return updated
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteLivestreamChannel(id: string): Promise<void> {
    try {
      await this.livestreamChannelModel.findByIdAndDelete(id).exec()
      return
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
