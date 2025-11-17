import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesChannelsController } from "./saleschannels.controller"
import { SalesChannelsService } from "./saleschannels.service"
import { SalesChannelSchema } from "../database/mongoose/schemas/SalesChannel"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "saleschannels", schema: SalesChannelSchema },
      { name: "users", schema: UserSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesChannelsController],
  providers: [SalesChannelsService],
  exports: [SalesChannelsService]
})
export class SalesChannelsModule {}
