import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamController } from "./livestream.controller"
import { LivestreamService } from "./livestream.service"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"
import { LivestreamPeriodSchema } from "../database/mongoose/schemas/LivestreamPeriod"
import { LivestreamEmployeeSchema } from "../database/mongoose/schemas/LivestreamEmployee"
import { LivestreamMonthGoalSchema } from "../database/mongoose/schemas/LivestreamGoal"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreams", schema: LivestreamSchema },
      { name: "livestreamperiods", schema: LivestreamPeriodSchema },
      { name: "livestreamemployees", schema: LivestreamEmployeeSchema },
      { name: "livestreammonthgoals", schema: LivestreamMonthGoalSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreamController],
  providers: [LivestreamService],
  exports: [LivestreamService]
})
export class LivestreamModule {}
