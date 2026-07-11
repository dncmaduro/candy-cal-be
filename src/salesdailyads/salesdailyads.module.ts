import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesDailyAdsSchema } from "../database/mongoose/schemas/SalesDailyAds"
import { SalesDailyReportSchema } from "../database/mongoose/schemas/SalesDailyReport"
import { SalesDailyAdsController } from "./salesdailyads.controller"
import { SalesDailyAdsService } from "./salesdailyads.service"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesdailyads", schema: SalesDailyAdsSchema },
      { name: "salesdailyreports", schema: SalesDailyReportSchema }
    ])
  ],
  controllers: [SalesDailyAdsController],
  providers: [SalesDailyAdsService],
  exports: [SalesDailyAdsService]
})
export class SalesDailyAdsModule {}
