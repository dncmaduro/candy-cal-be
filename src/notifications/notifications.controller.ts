import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common"
import { NotificationsService } from "./notifications.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { Notification } from "../database/mongoose/schemas/Notification"

@Controller("notifications")
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Roles("admin", "order-emp", "accounting-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getNotifications(
    @Req() req,
    @Query("page") page = 1
  ): Promise<{ notifications: Notification[]; hasMore: boolean }> {
    return this.notificationsService.getNotifications(req.user.userId, page)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Patch(":id/read")
  @HttpCode(HttpStatus.OK)
  async markAsRead(@Param("id") id: string): Promise<Notification> {
    return this.notificationsService.markAsRead(id)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Patch(":id/unread")
  @HttpCode(HttpStatus.OK)
  async markAsUnread(@Param("id") id: string): Promise<Notification> {
    return this.notificationsService.markAsUnread(id)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Post("allread")
  @HttpCode(HttpStatus.OK)
  async markAllAsRead(@Req() req): Promise<void> {
    await this.notificationsService.markAllAsRead(req.user._id)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  async deleteNotification(
    @Param("id") id: string
  ): Promise<{ message: string }> {
    await this.notificationsService.deleteNotification(id)
    return { message: "Thông báo đã được xóa" }
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Post("allviewed")
  @HttpCode(HttpStatus.OK)
  async markAllAsViewed(@Req() req): Promise<{ message: string }> {
    await this.notificationsService.markAllAsViewed(req.user.userId)
    return { message: "Đã đánh dấu tất cả thông báo là đã xem" }
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("unviewed-count")
  @HttpCode(HttpStatus.OK)
  async getUnviewedCount(@Req() req): Promise<{ count: number }> {
    const count = await this.notificationsService.getUnviewedCount(
      req.user.userId
    )
    return { count }
  }
}
