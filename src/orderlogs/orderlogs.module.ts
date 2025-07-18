import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { OrderLogSchema } from "src/database/mongoose/schemas/OrderLog"
import { OrderLogsController } from "./orderlogs.controller"
import { OrderLogsService } from "./orderlogs.service"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "orderlogs", schema: OrderLogSchema }])
  ],
  controllers: [OrderLogsController],
  providers: [OrderLogsService],
  exports: [OrderLogsService]
})
export class OrderLogsModule {}
