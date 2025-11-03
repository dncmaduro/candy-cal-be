import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesOrdersController } from "./salesorders.controller"
import { SalesOrdersService } from "./salesorders.service"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { SalesItemSchema } from "../database/mongoose/schemas/SalesItem"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salesitems", schema: SalesItemSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesOrdersController],
  providers: [SalesOrdersService],
  exports: [SalesOrdersService]
})
export class SalesOrdersModule {}
