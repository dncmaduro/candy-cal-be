import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ShopeeDailyAdsSchema } from "../database/mongoose/schemas/ShopeeDailyAds"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { ShopeeDailyAdsController } from "./shopeedailyads.controller"
import { ShopeeDailyAdsService } from "./shopeedailyads.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "shopeedailyads", schema: ShopeeDailyAdsSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [ShopeeDailyAdsController],
  providers: [ShopeeDailyAdsService],
  exports: [ShopeeDailyAdsService]
})
export class ShopeeDailyAdsModule {}
