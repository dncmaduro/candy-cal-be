import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesTasksController } from "./salestasks.controller"
import { SalesTasksService } from "./salestasks.service"
import {
  SalesTask,
  SalesTaskSchema
} from "../database/mongoose/schemas/SalesTask"
import {
  SalesFunnel,
  SalesFunnelSchema
} from "../database/mongoose/schemas/SalesFunnel"
import {
  SalesActivity,
  SalesActivitySchema
} from "../database/mongoose/schemas/SalesActivity"
import { User, UserSchema } from "../database/mongoose/schemas/User"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salestasks", schema: SalesTaskSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema },
      { name: "salesactivities", schema: SalesActivitySchema },
      { name: "users", schema: UserSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesTasksController],
  providers: [SalesTasksService],
  exports: [SalesTasksService]
})
export class SalesTasksModule {}
