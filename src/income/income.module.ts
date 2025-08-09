import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { IncomeSchema } from "../database/mongoose/schemas/Income"
import { IncomeController } from "./income.controller"
import { IncomeService } from "./income.service"
import { PackingRulesModule } from "../packingrules/packingrules.module"
import { MonthGoalSchema } from "../database/mongoose/schemas/MonthGoal"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "incomes", schema: IncomeSchema },
      { name: "monthgoals", schema: MonthGoalSchema }
    ]),
    PackingRulesModule,
    SystemLogsModule
  ],
  controllers: [IncomeController],
  providers: [IncomeService],
  exports: [IncomeService]
})
export class IncomeModule {}
