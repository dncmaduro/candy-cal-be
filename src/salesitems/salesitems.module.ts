import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesItemsController } from "./salesitems.controller"
import { SalesItemsService } from "./salesitems.service"
import { SalesItemSchema } from "../database/mongoose/schemas/SalesItem"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesitems", schema: SalesItemSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesItemsController],
  providers: [SalesItemsService],
  exports: [SalesItemsService]
})
export class SalesItemsModule {}
