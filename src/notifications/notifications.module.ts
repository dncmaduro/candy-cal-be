import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { NotificationSchema } from "../database/mongoose/schemas/Notification"
import { NotificationsController } from "./notifications.controller"
import { NotificationsService } from "./notifications.service"
import { NotificationsGateway } from "./notifications.gateway"
import { UserSchema } from "../database/mongoose/schemas/User"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "notifications", schema: NotificationSchema },
      { name: "users", schema: UserSchema }
    ])
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway]
})
export class NotificationsModule {}
