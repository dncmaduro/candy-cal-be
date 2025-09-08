import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { UserSchema } from "./mongoose/schemas/User"
import { ProductSchema } from "./mongoose/schemas/Product"
import { ItemSchema } from "./mongoose/schemas/Item"
import { CommonOrderSchema } from "./mongoose/schemas/CommonOrder"
import { LogSchema } from "./mongoose/schemas/Log"
import { StorageItemSchema } from "./mongoose/schemas/StorageItem"
import { StorageLogSchema } from "./mongoose/schemas/StorageLog"
import { DeliveredRequestSchema } from "./mongoose/schemas/DeliveredRequest"
import { ReadyComboSchema } from "./mongoose/schemas/ReadyCombo"
import { OrderLogSchema } from "./mongoose/schemas/OrderLog"
import { MonthGoalSchema } from "./mongoose/schemas/MonthGoal"
import { IncomeSchema } from "./mongoose/schemas/Income"
import { PackingRuleSchema } from "./mongoose/schemas/PackingRule"
import { SessionLogSchema } from "./mongoose/schemas/SessionLog"
import { DailyLogSchema } from "./mongoose/schemas/DailyLog"
import { SystemLogSchema } from "./mongoose/schemas/SystemLog"
import { DailyAdsSchema } from "./mongoose/schemas/DailyAds"
import { LivestreamPeriodSchema } from "./mongoose/schemas/LivestreamPeriod"
import { LivestreamEmployeeSchema } from "./mongoose/schemas/LivestreamEmployee"
import { LivestreamSchema } from "./mongoose/schemas/Livestream"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "users", schema: UserSchema },
      { name: "products", schema: ProductSchema },
      { name: "items", schema: ItemSchema },
      { name: "commonorders", schema: CommonOrderSchema },
      { name: "logs", schema: LogSchema },
      { name: "storageitems", schema: StorageItemSchema },
      { name: "storagelogs", schema: StorageLogSchema },
      { name: "deliveredrequests", schema: DeliveredRequestSchema },
      { name: "readycombos", schema: ReadyComboSchema },
      { name: "orderlogs", schema: OrderLogSchema },
      { name: "monthgoals", schema: MonthGoalSchema },
      { name: "incomes", schema: IncomeSchema },
      { name: "packingrules", schema: PackingRuleSchema },
      { name: "sessionlogs", schema: SessionLogSchema },
      { name: "dailylogs", schema: DailyLogSchema },
      { name: "systemlogs", schema: SystemLogSchema },
      { name: "dailyads", schema: DailyAdsSchema },
      { name: "livestreamperiods", schema: LivestreamPeriodSchema },
      { name: "livestreamemployees", schema: LivestreamEmployeeSchema },
      { name: "livestreams", schema: LivestreamSchema }
    ])
  ],
  exports: [MongooseModule] // Export MongooseModule for use in other modules
})
export class DatabaseModule {}
