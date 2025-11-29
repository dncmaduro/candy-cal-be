import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesDailyReportsController } from "./salesdailyreports.controller"
import { SalesDailyReportSchema } from "../database/mongoose/schemas/SalesDailyReport"
import { SalesMonthKpiSchema } from "../database/mongoose/schemas/SalesMonthKpi"
import { SalesDashboardModule } from "../salesdashboard/salesdashboard.module"
import { DailyAdsSchema } from "../database/mongoose/schemas/DailyAds"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SalesDailyReportsService } from "./salesdailyreports.service"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesdailyreports", schema: SalesDailyReportSchema },
      { name: "salesmonthkpis", schema: SalesMonthKpiSchema },
      { name: "dailyads", schema: DailyAdsSchema },
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema }
    ]),
    SalesDashboardModule
  ],
  controllers: [SalesDailyReportsController],
  providers: [SalesDailyReportsService],
  exports: [SalesDailyReportsService]
})
export class SalesDailyReportsModule {}
