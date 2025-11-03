import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesChannelsController } from "./saleschannels.controller"
import { SalesChannelsService } from "./saleschannels.service"
import { SalesChannelSchema } from "../database/mongoose/schemas/SalesChannel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "saleschannels", schema: SalesChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesChannelsController],
  providers: [SalesChannelsService],
  exports: [SalesChannelsService]
})
export class SalesChannelsModule {}
