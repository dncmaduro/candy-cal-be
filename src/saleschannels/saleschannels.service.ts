import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { SalesChannel } from "../database/mongoose/schemas/SalesChannel"

@Injectable()
export class SalesChannelsService {
  constructor(
    @InjectModel("saleschannels")
    private readonly salesChannelModel: Model<SalesChannel>
  ) {}

  async createChannel(payload: { channelName: string }): Promise<SalesChannel> {
    try {
      const doc = new this.salesChannelModel({
        channelName: payload.channelName
      })
      return await doc.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo kênh bán hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateChannel(
    id: string,
    payload: { channelName?: string }
  ): Promise<SalesChannel> {
    try {
      const updated = await this.salesChannelModel.findByIdAndUpdate(
        id,
        {
          $set: {
            ...(payload.channelName
              ? { channelName: payload.channelName }
              : {}),
            updatedAt: new Date()
          }
        },
        { new: true }
      )
      if (!updated)
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
      return updated
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật kênh bán hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchChannels(
    searchText?: string,
    page = 1,
    limit = 10
  ): Promise<{ data: SalesChannel[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter: any = { deletedAt: null }
      if (searchText && String(searchText).trim().length > 0) {
        filter.channelName = {
          $regex: `.*${String(searchText).trim()}.*`,
          $options: "i"
        }
      }

      const [channels, total] = await Promise.all([
        this.salesChannelModel
          .find(filter)
          .sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        this.salesChannelModel.countDocuments(filter)
      ])

      return { data: channels as SalesChannel[], total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tìm kiếm kênh bán hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getChannelById(id: string): Promise<SalesChannel | null> {
    try {
      return await this.salesChannelModel.findById(id).lean()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy kênh bán hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteChannel(id: string): Promise<void> {
    try {
      const updated = await this.salesChannelModel.findByIdAndUpdate(
        id,
        { $set: { deletedAt: new Date() } },
        { new: true }
      )
      if (!updated)
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xóa kênh bán hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getChannelByChannelId(channelId: string): Promise<SalesChannel | null> {
    try {
      return await this.salesChannelModel.findOne({ channelId }).lean()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy kênh bán hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
