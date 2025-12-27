import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreammonthgoalsController } from "./livestreammonthgoals.controller"
import { LivestreammonthgoalsService } from "./livestreammonthgoals.service"
import { LivestreamMonthGoalSchema } from "../database/mongoose/schemas/LivestreamGoal"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreammonthgoals", schema: LivestreamMonthGoalSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreammonthgoalsController],
  providers: [LivestreammonthgoalsService],
  exports: [LivestreammonthgoalsService]
})
export class LivestreammonthgoalsModule {}
