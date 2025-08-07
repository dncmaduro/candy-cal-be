import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Notification } from "../database/mongoose/schemas/Notification"
import { NotificationDto } from "./dto/notifications.dto"
import { NotificationsGateway } from "./notifications.gateway"
import { User } from "../database/mongoose/schemas/User"

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel("notifications")
    private readonly notificationModel: Model<Notification>,
    @InjectModel("users")
    private readonly userModel: Model<User>,
    private readonly notificationsGateway: NotificationsGateway
  ) {}

  async createNotification(
    notification: NotificationDto
  ): Promise<Notification> {
    try {
      const newNotification = new this.notificationModel({
        ...notification
      })
      return await newNotification.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo thông báo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async createNotificationForSingleUser(
    notification: NotificationDto,
    userId: string
  ): Promise<Notification> {
    try {
      const newNotification = new this.notificationModel({
        ...notification,
        read: false,
        viewed: false,
        userId
      })
      this.notificationsGateway.notifyUser(userId, newNotification)
      return await newNotification.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo thông báo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async createNotificationsForRoles(
    notification: NotificationDto,
    role: "order-emp" | "accounting-emp" | "admin"
  ): Promise<Notification[]> {
    try {
      const users = await this.userModel.find({ role }).distinct("_id").exec()

      const notifications = users.map((userId) => ({
        ...notification,
        read: false,
        viewed: false,
        userId: userId.toString()
      }))

      notifications.forEach((notif) => {
        this.notificationsGateway.notifyUser(notif.userId, notif)
      })

      return await this.notificationModel.insertMany(notifications)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo thông báo cho vai trò",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getNotifications(
    userId: string,
    page: number
  ): Promise<{ notifications: Notification[]; hasMore: boolean }> {
    try {
      const limit = 10
      const skip = (page - 1) * limit
      const notifications = await this.notificationModel
        .find({ userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec()
      const total = await this.notificationModel.countDocuments({ userId })
      const hasMore = total > skip + limit
      return { notifications, hasMore }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy thông báo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async markAsRead(notificationId: string): Promise<Notification> {
    try {
      const notification = await this.notificationModel.findByIdAndUpdate(
        notificationId,
        { read: true },
        { new: true }
      )
      if (!notification) {
        throw new HttpException(
          "Không tìm thấy thông báo",
          HttpStatus.NOT_FOUND
        )
      }
      return notification
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi đánh dấu đã đọc",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async markAllAsRead(userId: string): Promise<void> {
    try {
      await this.notificationModel.updateMany(
        { userId, read: false },
        { read: true }
      )
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi đánh dấu tất cả thông báo đã đọc",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async markAsUnread(notificationId: string): Promise<Notification> {
    try {
      const notification = await this.notificationModel.findByIdAndUpdate(
        notificationId,
        { read: false },
        { new: true }
      )
      if (!notification) {
        throw new HttpException(
          "Không tìm thấy thông báo",
          HttpStatus.NOT_FOUND
        )
      }
      return notification
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi đánh dấu chưa đọc",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteNotification(id: string): Promise<void> {
    try {
      await this.notificationModel.findByIdAndDelete(id)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xóa thông báo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async markAllAsViewed(userId: string): Promise<void> {
    try {
      await this.notificationModel.updateMany(
        { userId, viewed: false },
        { viewed: true }
      )
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi đánh dấu tất cả thông báo đã xem",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getUnviewedCount(userId: string): Promise<number> {
    try {
      return await this.notificationModel.countDocuments({
        userId,
        viewed: false
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy số lượng thông báo chưa xem",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
