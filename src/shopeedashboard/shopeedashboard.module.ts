import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { ShopeeMonthKpiSchema } from "../database/mongoose/schemas/ShopeeMonthKpi"
import { ShopeeDailyAdsSchema } from "../database/mongoose/schemas/ShopeeDailyAds"
import { ShopeeDailyLiveRevenueSchema } from "../database/mongoose/schemas/ShopeeDailyLiveRevenue"
import { ShopeeIncomeSchema } from "../database/mongoose/schemas/ShopeeIncome"
import { ShopeeDashboardController } from "./shopeedashboard.controller"
import { ShopeeDashboardService } from "./shopeedashboard.service"
import { ShopeeDashboardRepository } from "./shopee-dashboard.repository"
import { MonthlyShopeeDashboardService } from "./monthly-shopee-dashboard.service"
import { RangeShopeeAnalyticsService } from "./range-shopee-analytics.service"
import { ShopeeOrdersService } from "./shopee-orders.service"
import { MonthlyShopeeDashboardController } from "./monthly-shopee-dashboard.controller"
import { RangeShopeeAnalyticsController } from "./range-shopee-analytics.controller"
import { ShopeeOrdersController } from "./shopee-orders.controller"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreamchannels", schema: LivestreamChannelSchema },
      { name: "shopeemonthkpis", schema: ShopeeMonthKpiSchema },
      { name: "shopeedailyads", schema: ShopeeDailyAdsSchema },
      {
        name: "shopeedailyliverevenues",
        schema: ShopeeDailyLiveRevenueSchema
      },
      { name: "shopeeincomes", schema: ShopeeIncomeSchema }
    ])
  ],
  controllers: [
    ShopeeDashboardController,
    MonthlyShopeeDashboardController,
    RangeShopeeAnalyticsController,
    ShopeeOrdersController
  ],
  providers: [
    ShopeeDashboardService,
    ShopeeDashboardRepository,
    MonthlyShopeeDashboardService,
    RangeShopeeAnalyticsService,
    ShopeeOrdersService
  ],
  exports: [
    ShopeeDashboardService,
    MonthlyShopeeDashboardService,
    RangeShopeeAnalyticsService,
    ShopeeOrdersService
  ]
})
export class ShopeeDashboardModule {}
