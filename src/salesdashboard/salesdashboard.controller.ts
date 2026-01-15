import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesDashboardService } from "./salesdashboard.service"

@Controller("salesdashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesDashboardController {
  constructor(private readonly salesDashboardService: SalesDashboardService) {}

  @Roles("admin", "sales-emp", "system-emp")
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

  @Roles("admin", "sales-emp", "system-emp")
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

  @Roles("admin", "sales-emp", "system-emp")
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
