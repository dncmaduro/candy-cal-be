import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { OrderLogSchema } from "../database/mongoose/schemas/OrderLog"
import { OrderLogsController } from "./orderlogs.controller"
import { OrderLogsService } from "./orderlogs.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "orderlogs", schema: OrderLogSchema }]),
    SystemLogsModule
  ],
  controllers: [OrderLogsController],
  providers: [OrderLogsService],
  exports: [OrderLogsService]
})
export class OrderLogsModule {}
