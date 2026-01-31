import {
  Injectable,
  BadRequestException,
  InternalServerErrorException
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { DeliveredRequest } from "../database/mongoose/schemas/DeliveredRequest"
import { DeliveredRequestDto } from "./dto/deliveredrequests.dto"
import { startOfDay, endOfDay } from "date-fns"
import { StorageLogsService } from "../storagelogs/storagelogs.service"
import { NotificationsService } from "../notifications/notifications.service"
import { NotificationDto } from "../notifications/dto/notifications.dto"

@Injectable()
export class DeliveredRequestsService {
  constructor(
    @InjectModel("deliveredrequests")
    private readonly deliveredRequestModel: Model<DeliveredRequest>,
    private readonly storageLogsService: StorageLogsService,
    private readonly notificationsService: NotificationsService
  ) {}

  async createRequest(request: DeliveredRequestDto): Promise<DeliveredRequest> {
    const start = startOfDay(new Date(request.date))
    const end = endOfDay(new Date(request.date))

    const baseQuery: any = { date: { $gte: start, $lte: end } }
    if (request.channelId) baseQuery.channel = request.channelId

    const existed = await this.deliveredRequestModel.findOne({
      ...baseQuery,
      accepted: true
    })

    if (existed) {
      throw new BadRequestException(
        "Không thể tạo/sửa yêu cầu đã được xác nhận"
      )
    }

    const newRequest = await this.deliveredRequestModel.findOneAndUpdate(
      baseQuery,
      {
        $set: {
          items: request.items,
          note: request.note,
          date: request.date,
          ...(request.channelId ? { channel: request.channelId } : {}),
          updatedAt: Date.now()
        }
      },
      { upsert: true, new: true }
    )

    const notification: NotificationDto = {
      title: "Yêu cầu xuất kho cho vận đơn",
      content: `Yêu cầu giao hàng đã được cập nhật cho ngày ${newRequest.date.toLocaleDateString()}`,
      createdAt: new Date(),
      type: "delivered-request",
      link: `/delivered-requests`
    }

    this.notificationsService.createNotificationsForRoles(
      notification,
      "accounting-emp"
    )

    return newRequest
  }

  async addComment(
    requestId: string,
    comment: {
      userId: string
      name: string
      text: string
      date: Date
    }
  ): Promise<DeliveredRequest> {
    try {
      const updated = await this.deliveredRequestModel.findByIdAndUpdate(
        requestId,
        { $push: { comments: comment } },
        { new: true }
      )
      if (!updated) throw new BadRequestException("Không tìm thấy yêu cầu")
      return updated
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async acceptRequest(requestId: string): Promise<DeliveredRequest> {
    try {
      const req = await this.deliveredRequestModel.findById(requestId)
      if (!req) throw new BadRequestException("Không tìm thấy yêu cầu")
      if (req.accepted) throw new BadRequestException("Đã được chấp nhận rồi")

      req.accepted = true
      req.updatedAt = new Date()
      await req.save()

      // Create single storage log with all items instead of multiple logs
      await this.storageLogsService.createRequest({
        items: req.items.map((item) => ({
          _id: item._id.toString(),
          quantity: item.quantity
        })),
        status: "delivered",
        date: req.date,
        note: req.note,
        deliveredRequestId: requestId
      })

      return req
    } catch (error) {
      console.error(error)
      throw error
    }
  }

  async searchRequests(
    channelId?: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 10
  ): Promise<{ requests: DeliveredRequest[]; total: number }> {
    try {
      const query: any = {}

      if (channelId) query.channel = channelId

      if (startDate && endDate) {
        query.date = { $gte: new Date(startDate), $lte: new Date(endDate) }
      } else if (startDate) {
        query.date = { $gte: new Date(startDate) }
      } else if (endDate) {
        query.date = { $lte: new Date(endDate) }
      }

      const skip = (page - 1) * limit

      const [requests, total] = await Promise.all([
        this.deliveredRequestModel
          .find(query)
          .sort({ date: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
        this.deliveredRequestModel.countDocuments(query)
      ])

      return { requests, total }
    } catch (error) {
      console.error(error)
      throw new InternalServerErrorException("Internal server error")
    }
  }

  async getRequest(idOrDate: string, channelId?: string): Promise<DeliveredRequest> {
    try {
      if (Types.ObjectId.isValid(idOrDate)) {
        const request = await this.deliveredRequestModel.findById(idOrDate)
        if (!request) throw new BadRequestException("Không tìm thấy yêu cầu")
        return request
      }

      const start = startOfDay(new Date(idOrDate))
      const end = endOfDay(new Date(idOrDate))

      const query: any = { date: { $gte: start, $lte: end } }
      if (channelId) query.channel = channelId

      const request = await this.deliveredRequestModel.findOne(query)

      if (!request) {
        throw new BadRequestException("Không tìm thấy yêu cầu")
      }

      return request
    } catch (error) {
      console.error(error)
      if (error instanceof BadRequestException) throw error
      throw new InternalServerErrorException("Internal server error")
    }
  }

  async undoAcceptRequest(requestId: string): Promise<DeliveredRequest> {
    try {
      const req = await this.deliveredRequestModel.findById(requestId)
      if (!req) throw new BadRequestException("Không tìm thấy yêu cầu")
      if (!req.accepted) throw new BadRequestException("Chưa được chấp nhận")

      req.accepted = false
      req.updatedAt = new Date()
      await req.save()

      // Undo all storage logs related to this request
      await this.storageLogsService.deleteStorageLogsCreatedByDeliveredRequest(
        requestId
      )

      return req
    } catch (error) {
      console.error(error)
      throw error
    }
  }
}
