import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { SalesChannel } from "../database/mongoose/schemas/SalesChannel"
import { User } from "../database/mongoose/schemas/User"

@Injectable()
export class SalesChannelsService {
  constructor(
    @InjectModel("saleschannels")
    private readonly salesChannelModel: Model<SalesChannel>,
    @InjectModel("users")
    private readonly userModel: Model<User>
  ) {}

  async createChannel(payload: {
    channelName: string
    assignedTo?: string
  }): Promise<SalesChannel> {
    try {
      // If assignedTo is provided, validate user exists and has sales-emp role
      if (payload.assignedTo) {
        const user = await this.userModel.findById(payload.assignedTo)
        if (!user) {
          throw new HttpException(
            "Người dùng không tồn tại",
            HttpStatus.NOT_FOUND
          )
        }
        if (!user.roles || !user.roles.includes("sales-emp")) {
          throw new HttpException(
            "Người dùng phải có quyền sales-emp",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      const doc = new this.salesChannelModel({
        channelName: payload.channelName,
        assignedTo: payload.assignedTo
          ? new Types.ObjectId(payload.assignedTo)
          : undefined
      })
      return await doc.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo kênh bán hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateChannel(
    id: string,
    payload: { channelName?: string; assignedTo?: string }
  ): Promise<SalesChannel> {
    try {
      // If assignedTo is provided, validate user exists and has sales-emp role
      if (payload.assignedTo) {
        const user = await this.userModel.findById(payload.assignedTo)
        if (!user) {
          throw new HttpException(
            "Người dùng không tồn tại",
            HttpStatus.NOT_FOUND
          )
        }
        if (!user.roles || !user.roles.includes("sales-emp")) {
          throw new HttpException(
            "Người dùng phải có quyền sales-emp",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      const updateData: any = {
        updatedAt: new Date()
      }

      if (payload.channelName) {
        updateData.channelName = payload.channelName
      }

      if (payload.assignedTo !== undefined) {
        updateData.assignedTo = payload.assignedTo
          ? new Types.ObjectId(payload.assignedTo)
          : null
      }

      const updated = await this.salesChannelModel.findByIdAndUpdate(
        id,
        { $set: updateData },
        { new: true }
      )
      if (!updated)
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
      return updated
    } catch (error) {
      if (error instanceof HttpException) throw error
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
          .populate("assignedTo", "name username")
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
      return await this.salesChannelModel
        .findById(id)
        .populate("assignedTo", "name username")
        .lean()
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

  async assignUser(
    channelId: string,
    userId: string | null
  ): Promise<SalesChannel> {
    try {
      // Validate channel exists
      const channel = await this.salesChannelModel.findById(channelId)
      if (!channel) {
        throw new HttpException(
          "Kênh bán hàng không tồn tại",
          HttpStatus.NOT_FOUND
        )
      }

      // If userId is provided, validate user exists and has sales-emp role
      if (userId) {
        const user = await this.userModel.findById(userId)
        if (!user) {
          throw new HttpException(
            "Người dùng không tồn tại",
            HttpStatus.NOT_FOUND
          )
        }
        if (!user.roles || !user.roles.includes("sales-emp")) {
          throw new HttpException(
            "Người dùng phải có quyền sales-emp",
            HttpStatus.BAD_REQUEST
          )
        }
      }

      // Update channel
      const updated = await this.salesChannelModel.findByIdAndUpdate(
        channelId,
        {
          $set: {
            assignedTo: userId ? new Types.ObjectId(userId) : null,
            updatedAt: new Date()
          }
        },
        { new: true }
      )

      if (!updated) {
        throw new HttpException(
          "Kênh bán hàng không tồn tại",
          HttpStatus.NOT_FOUND
        )
      }

      return updated
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in assignUser:", error)
      throw new HttpException(
        "Lỗi khi gán người phụ trách kênh",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
