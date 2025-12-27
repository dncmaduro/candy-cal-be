import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamcoreController } from "./livestreamcore.controller"
import { LivestreamcoreService } from "./livestreamcore.service"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"
import { LivestreamPeriodSchema } from "../database/mongoose/schemas/LivestreamPeriod"
import { LivestreamMonthGoalSchema } from "../database/mongoose/schemas/LivestreamGoal"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreams", schema: LivestreamSchema },
      { name: "livestreamperiods", schema: LivestreamPeriodSchema },
      { name: "livestreammonthgoals", schema: LivestreamMonthGoalSchema },
      { name: "users", schema: UserSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreamcoreController],
  providers: [LivestreamcoreService],
  exports: [LivestreamcoreService]
})
export class LivestreamcoreModule {}
