import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamController } from "./livestream.controller"
import { LivestreamService } from "./livestream.service"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"
import { LivestreamPeriodSchema } from "../database/mongoose/schemas/LivestreamPeriod"
import { LivestreamMonthGoalSchema } from "../database/mongoose/schemas/LivestreamGoal"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { LivestreamAltRequestSchema } from "../database/mongoose/schemas/LivestreamAltRequest"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreams", schema: LivestreamSchema },
      { name: "livestreamperiods", schema: LivestreamPeriodSchema },
      { name: "livestreammonthgoals", schema: LivestreamMonthGoalSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema },
      { name: "livestreamaltrequest", schema: LivestreamAltRequestSchema },
      { name: "users", schema: UserSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreamController],
  providers: [LivestreamService],
  exports: [LivestreamService]
})
export class LivestreamModule {}
