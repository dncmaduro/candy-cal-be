import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesDashboardController } from "./salesdashboard.controller"
import { SalesDashboardService } from "./salesdashboard.service"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SalesMonthKpiSchema } from "../database/mongoose/schemas/SalesMonthKpi"
import { SalesDailyReportSchema } from "../database/mongoose/schemas/SalesDailyReport"
import { SalesDailyAdsSchema } from "../database/mongoose/schemas/SalesDailyAds"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema },
      { name: "salesmonthkpi", schema: SalesMonthKpiSchema },
      { name: "salesdailyreports", schema: SalesDailyReportSchema },
      { name: "salesdailyads", schema: SalesDailyAdsSchema }
    ])
  ],
  controllers: [SalesDashboardController],
  providers: [SalesDashboardService],
  exports: [SalesDashboardService, MongooseModule]
})
export class SalesDashboardModule {}
