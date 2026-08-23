import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { RangeShopeeAnalyticsService } from "./range-shopee-analytics.service"
import { RangeSummaryQueryDto } from "./dto/range-summary-query.dto"
import { RangeTimeseriesQueryDto } from "./dto/range-timeseries-query.dto"

@Controller("shopee/analytics")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RangeShopeeAnalyticsController {
  constructor(
    private readonly rangeShopeeAnalyticsService: RangeShopeeAnalyticsService
  ) {}

  @Permissions()
  @Get("range-summary")
  @HttpCode(HttpStatus.OK)
  async getRangeSummary(@Query() query: RangeSummaryQueryDto) {
    return this.rangeShopeeAnalyticsService.getRangeSummary(query)
  }

  @Permissions()
  @Get("range-timeseries")
  @HttpCode(HttpStatus.OK)
  async getRangeTimeseries(@Query() query: RangeTimeseriesQueryDto) {
    return this.rangeShopeeAnalyticsService.getRangeTimeseries(query)
  }

  @Permissions()
  @Get("range-compare")
  @HttpCode(HttpStatus.OK)
  async getRangeCompare(
    @Query("channel") channel: string,
    @Query("orderFrom") orderFrom: string,
    @Query("orderTo") orderTo: string,
    @Query("compare") compare: string
  ) {
    return this.rangeShopeeAnalyticsService.getRangeCompare({
      channel,
      orderFrom,
      orderTo,
      compare
    })
  }
}
