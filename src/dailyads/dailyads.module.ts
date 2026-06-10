import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { DailyAdsSchema } from "../database/mongoose/schemas/DailyAds"
import { DailyAdsMetricsSchema } from "../database/mongoose/schemas/DailyAdsMetrics"
import { IncomeSchema } from "../database/mongoose/schemas/Income"
import { DailyAdsController } from "./dailyads.controller"
import { DailyAdsService } from "./dailyads.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"
import { CurrencyExchangeService } from "../common/currency-exchange.service"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "dailyads", schema: DailyAdsSchema },
      { name: "dailyadsmetrics", schema: DailyAdsMetricsSchema },
      { name: "incomes", schema: IncomeSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [DailyAdsController],
  providers: [DailyAdsService, CurrencyExchangeService],
  exports: [DailyAdsService]
})
export class DailyAdsModule {}
