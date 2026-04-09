import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { RangeShopeeAnalyticsService } from "./range-shopee-analytics.service"
import { RangeSummaryQueryDto } from "./dto/range-summary-query.dto"
import { RangeTimeseriesQueryDto } from "./dto/range-timeseries-query.dto"

@Controller("shopee/analytics")
@UseGuards(JwtAuthGuard, RolesGuard)
export class RangeShopeeAnalyticsController {
  constructor(
    private readonly rangeShopeeAnalyticsService: RangeShopeeAnalyticsService
  ) {}

  @Roles("admin", "shopee-emp", "system-emp")
  @Get("range-summary")
  @HttpCode(HttpStatus.OK)
  async getRangeSummary(@Query() query: RangeSummaryQueryDto) {
    return this.rangeShopeeAnalyticsService.getRangeSummary(query)
  }

  @Roles("admin", "shopee-emp", "system-emp")
  @Get("range-timeseries")
  @HttpCode(HttpStatus.OK)
  async getRangeTimeseries(@Query() query: RangeTimeseriesQueryDto) {
    return this.rangeShopeeAnalyticsService.getRangeTimeseries(query)
  }

  @Roles("admin", "shopee-emp", "system-emp")
  @Get("range-compare")
  @HttpCode(HttpStatus.OK)
  async getRangeCompare(
    @Query("channel") channel: string,
    @Query("from") from: string,
    @Query("to") to: string,
    @Query("compare") compare: string
  ) {
    return this.rangeShopeeAnalyticsService.getRangeCompare({
      channel,
      from,
      to,
      compare
    })
  }
}
