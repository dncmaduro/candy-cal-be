import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesActivitiesController } from "./salesactivities.controller"
import { SalesActivitiesService } from "./salesactivities.service"
import { SalesActivitySchema } from "../database/mongoose/schemas/SalesActivity"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SalesTaskSchema } from "../database/mongoose/schemas/SalesTask"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesactivities", schema: SalesActivitySchema },
      { name: "salesfunnel", schema: SalesFunnelSchema },
      { name: "salestasks", schema: SalesTaskSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesActivitiesController],
  providers: [SalesActivitiesService],
  exports: [SalesActivitiesService]
})
export class SalesActivitiesModule {}
