import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamanalyticsController } from "./livestreamanalytics.controller"
import { LivestreamanalyticsService } from "./livestreamanalytics.service"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreams", schema: LivestreamSchema }
    ])
  ],
  controllers: [LivestreamanalyticsController],
  providers: [LivestreamanalyticsService],
  exports: [LivestreamanalyticsService]
})
export class LivestreamanalyticsModule {}
