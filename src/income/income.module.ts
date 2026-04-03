import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { IncomeSchema } from "../database/mongoose/schemas/Income"
import { IncomeController } from "./income.controller"
import { IncomeService } from "./income.service"
import { PackingRulesModule } from "../packingrules/packingrules.module"
import { MonthGoalSchema } from "../database/mongoose/schemas/MonthGoal"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"
import { DailyAdsSchema } from "../database/mongoose/schemas/DailyAds"
import { DailyAdsV2Schema } from "../database/mongoose/schemas/DailyAdsV2"
import { NotificationsModule } from "../notifications/notifications.module"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { DailyAdsModule } from "../dailyads/dailyads.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "incomes", schema: IncomeSchema },
      { name: "monthgoals", schema: MonthGoalSchema },
      { name: "dailyads", schema: DailyAdsSchema },
      { name: "dailyadsv2", schema: DailyAdsV2Schema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ]),
    PackingRulesModule,
    DailyAdsModule,
    SystemLogsModule,
    NotificationsModule
  ],
  controllers: [IncomeController],
  providers: [IncomeService],
  exports: [IncomeService]
})
export class IncomeModule {}
