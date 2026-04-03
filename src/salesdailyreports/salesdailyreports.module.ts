import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesDailyReportsController } from "./salesdailyreports.controller"
import { SalesDailyReportSchema } from "../database/mongoose/schemas/SalesDailyReport"
import { SalesMonthKpiSchema } from "../database/mongoose/schemas/SalesMonthKpi"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SalesDailyReportsService } from "./salesdailyreports.service"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesdailyreports", schema: SalesDailyReportSchema },
      { name: "salesmonthkpis", schema: SalesMonthKpiSchema },
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema }
    ])
  ],
  controllers: [SalesDailyReportsController],
  providers: [SalesDailyReportsService],
  exports: [SalesDailyReportsService]
})
export class SalesDailyReportsModule {}
