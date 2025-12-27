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
import { ShopeeProductSchema } from "./mongoose/schemas/ShopeeProduct"
import { LivestreamMonthGoalSchema } from "./mongoose/schemas/LivestreamGoal"
import { SalesPriceItemSchema } from "./mongoose/schemas/SalesPriceItem"
import { SalesChannelSchema } from "./mongoose/schemas/SalesChannel"
import { ProvinceSchema } from "./mongoose/schemas/Province"
import { SalesFunnelSchema } from "./mongoose/schemas/SalesFunnel"
import { SalesOrderSchema } from "./mongoose/schemas/SalesOrder"
import { SalesItemSchema } from "./mongoose/schemas/SalesItem"
import { SalesCustomerRankSchema } from "./mongoose/schemas/SalesCustomerRank"
import { SalesActivitySchema } from "./mongoose/schemas/SalesActivity"
import { SalesTaskSchema } from "./mongoose/schemas/SalesTask"
import { SalesMonthKpiSchema } from "./mongoose/schemas/SalesMonthKpi"
import { SalesDailyReportSchema } from "./mongoose/schemas/SalesDailyReport"
import { LivestreamAltRequestSchema } from "./mongoose/schemas/LivestreamAltRequest"
import { LivestreamPerformanceSchema } from "./mongoose/schemas/LivestreamPerformance"

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
      { name: "livestreams", schema: LivestreamSchema },
      { name: "shopeeproducts", schema: ShopeeProductSchema },
      { name: "livestreammonthgoals", schema: LivestreamMonthGoalSchema },
      { name: "salespriceitems", schema: SalesPriceItemSchema },
      { name: "saleschannels", schema: SalesChannelSchema },
      { name: "provinces", schema: ProvinceSchema },
      { name: "salesfunnel", schema: SalesFunnelSchema },
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salesitems", schema: SalesItemSchema },
      { name: "salescustomerranks", schema: SalesCustomerRankSchema },
      { name: "salesactivities", schema: SalesActivitySchema },
      { name: "salestasks", schema: SalesTaskSchema },
      { name: "salesdailyreports", schema: SalesDailyReportSchema },
      { name: "salesmonthkpis", schema: SalesMonthKpiSchema },
      { name: "livestreamaltrequests", schema: LivestreamAltRequestSchema },
      { name: "livestreamperformance", schema: LivestreamPerformanceSchema }
    ])
  ],
  exports: [MongooseModule] // Export MongooseModule for use in other modules
})
export class DatabaseModule {}
