import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamperiodsController } from "./livestreamperiods.controller"
import { LivestreamperiodsService } from "./livestreamperiods.service"
import { LivestreamPeriodSchema } from "../database/mongoose/schemas/LivestreamPeriod"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreamperiods", schema: LivestreamPeriodSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreamperiodsController],
  providers: [LivestreamperiodsService],
  exports: [LivestreamperiodsService]
})
export class LivestreamperiodsModule {}
