import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ShopeeDailyLiveRevenueSchema } from "../database/mongoose/schemas/ShopeeDailyLiveRevenue"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { ShopeeDailyLiveRevenuesController } from "./shopeedailyliverevenues.controller"
import { ShopeeDailyLiveRevenuesService } from "./shopeedailyliverevenues.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      {
        name: "shopeedailyliverevenues",
        schema: ShopeeDailyLiveRevenueSchema
      },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [ShopeeDailyLiveRevenuesController],
  providers: [ShopeeDailyLiveRevenuesService],
  exports: [ShopeeDailyLiveRevenuesService]
})
export class ShopeeDailyLiveRevenuesModule {}
