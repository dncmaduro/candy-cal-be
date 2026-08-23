import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { SalesDashboardService } from "./salesdashboard.service"

@Controller("salesdashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesDashboardController {
  constructor(private readonly salesDashboardService: SalesDashboardService) {}

  @Permissions()
  @Get("province-stats")
  @HttpCode(HttpStatus.OK)
  async getProvinceSalesStats(
    @Query("date") date?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("channel") channel?: string
  ) {
    return this.salesDashboardService.getProvinceSalesStats({
      date,
      startDate,
      endDate,
      channel
    })
  }

  @Permissions()
  @Get("revenue-stats")
  @HttpCode(HttpStatus.OK)
  async getRevenueStats(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channel") channel?: string
  ) {
    return this.salesDashboardService.getRevenueStats(
      new Date(startDate),
      new Date(endDate),
      channel
    )
  }

  @Permissions()
  @Get("monthly-metrics")
  @HttpCode(HttpStatus.OK)
  async getMonthlyMetrics(
    @Query("year") year: string,
    @Query("month") month: string,
    @Query("channel") channel?: string
  ) {
    return this.salesDashboardService.getMonthlyMetrics(
      Number(year),
      Number(month),
      channel
    )
  }

  @Permissions()
  @Get("top-customers")
  @HttpCode(HttpStatus.OK)
  async getTopCustomersByRevenue(
    @Query("year") year: string,
    @Query("month") month: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("channel") channel?: string
  ) {
    return this.salesDashboardService.getTopCustomersByRevenue(
      Number(year),
      Number(month),
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      channel
    )
  }
}
