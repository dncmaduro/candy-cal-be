import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { NotificationSchema } from "../database/mongoose/schemas/Notification"
import { NotificationsController } from "./notifications.controller"
import { NotificationsService } from "./notifications.service"
import { NotificationsGateway } from "./notifications.gateway"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "notifications", schema: NotificationSchema },
      { name: "users", schema: UserSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService, NotificationsGateway],
  exports: [NotificationsService, NotificationsGateway]
})
export class NotificationsModule {}
