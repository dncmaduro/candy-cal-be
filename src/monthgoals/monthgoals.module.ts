import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { MonthGoalSchema } from "../database/mongoose/schemas/MonthGoal"
import { MonthGoalController } from "./monthgoals.controller"
import { MonthGoalService } from "./monthgoals.service"
import { IncomeModule } from "../income/income.module"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "MonthGoal", schema: MonthGoalSchema }]),
    IncomeModule,
    SystemLogsModule
  ],
  controllers: [MonthGoalController],
  providers: [MonthGoalService],
  exports: [MonthGoalService]
})
export class MonthGoalModule {}
