import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { MonthGoalSchema } from "../database/mongoose/schemas/MonthGoal"
import { MonthGoalController } from "./monthgoals.controller"
import { MonthGoalService } from "./monthgoals.service"
import { IncomeModule } from "src/income/income.module"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "MonthGoal", schema: MonthGoalSchema }]),
    IncomeModule
  ],
  controllers: [MonthGoalController],
  providers: [MonthGoalService],
  exports: [MonthGoalService]
})
export class MonthGoalModule {}
