import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ShopeeMonthKpiSchema } from "../database/mongoose/schemas/ShopeeMonthKpi"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { ShopeeMonthKpisController } from "./shopeemonthkpis.controller"
import { ShopeeMonthKpisService } from "./shopeemonthkpis.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "shopeemonthkpis", schema: ShopeeMonthKpiSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [ShopeeMonthKpisController],
  providers: [ShopeeMonthKpisService],
  exports: [ShopeeMonthKpisService]
})
export class ShopeeMonthKpisModule {}
