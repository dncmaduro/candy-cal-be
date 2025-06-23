import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { DeliveredRequestSchema } from "../database/mongoose/schemas/DeliveredRequest"
import { StorageLogsModule } from "../storagelogs/storagelogs.module"
import { DeliveredRequestsController } from "./deliveredrequest.controller"
import { DeliveredRequestsService } from "./deliveredrequests.service"
import { NotificationsModule } from "../notifications/notifications.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "deliveredrequests", schema: DeliveredRequestSchema }
    ]),
    StorageLogsModule,
    NotificationsModule
  ],
  controllers: [DeliveredRequestsController],
  providers: [DeliveredRequestsService],
  exports: [DeliveredRequestsService]
})
export class DeliveredRequestModule {}
