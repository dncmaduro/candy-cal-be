import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesItemsController } from "./salesitems.controller"
import { SalesItemsService } from "./salesitems.service"
import { SalesItemSchema } from "../database/mongoose/schemas/SalesItem"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesitems", schema: SalesItemSchema },
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesItemsController],
  providers: [SalesItemsService],
  exports: [SalesItemsService]
})
export class SalesItemsModule {}
