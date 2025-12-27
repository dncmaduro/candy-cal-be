import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamchannelsController } from "./livestreamchannels.controller"
import { LivestreamchannelsService } from "./livestreamchannels.service"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreamchannelsController],
  providers: [LivestreamchannelsService],
  exports: [LivestreamchannelsService]
})
export class LivestreamchannelsModule {}
