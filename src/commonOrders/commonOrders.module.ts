import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ItemSchema } from "../database/mongoose/schemas/Item"
import { CommonOrdersController } from "./commonOrders.controller"
import { CommonOrdersService } from "./commonOrders.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "commonOrders", schema: ItemSchema }]),
    SystemLogsModule
  ],
  controllers: [CommonOrdersController],
  providers: [CommonOrdersService],
  exports: [CommonOrdersService]
})
export class CommonOrdersModule {}
