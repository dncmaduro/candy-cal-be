import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesCustomerRanksController } from "./salescustomerranks.controller"
import { SalesCustomerRanksService } from "./salescustomerranks.service"
import { SalesCustomerRankSchema } from "../database/mongoose/schemas/SalesCustomerRank"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salescustomerranks", schema: SalesCustomerRankSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesCustomerRanksController],
  providers: [SalesCustomerRanksService],
  exports: [SalesCustomerRanksService]
})
export class SalesCustomerRanksModule {}
