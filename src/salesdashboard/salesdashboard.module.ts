import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesDashboardController } from "./salesdashboard.controller"
import { SalesDashboardService } from "./salesdashboard.service"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema }
    ])
  ],
  controllers: [SalesDashboardController],
  providers: [SalesDashboardService],
  exports: [SalesDashboardService, MongooseModule]
})
export class SalesDashboardModule {}
