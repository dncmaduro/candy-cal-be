import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamanalyticsController } from "./livestreamanalytics.controller"
import { LivestreamanalyticsService } from "./livestreamanalytics.service"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"
import { LivestreamMonthGoalSchema } from "../database/mongoose/schemas/LivestreamGoal"
import { UserSchema } from "../database/mongoose/schemas/User"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreams", schema: LivestreamSchema },
      { name: "livestreammonthgoals", schema: LivestreamMonthGoalSchema },
      { name: "users", schema: UserSchema }
    ])
  ],
  controllers: [LivestreamanalyticsController],
  providers: [LivestreamanalyticsService],
  exports: [LivestreamanalyticsService]
})
export class LivestreamanalyticsModule {}
