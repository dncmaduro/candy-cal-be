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
    @Query("endDate") endDate: string
  ) {
    return this.salesDashboardService.getRevenueStats(
      new Date(startDate),
      new Date(endDate)
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("monthly-metrics")
  @HttpCode(HttpStatus.OK)
  async getMonthlyMetrics(
    @Query("year") year: string,
    @Query("month") month: string
  ) {
    return this.salesDashboardService.getMonthlyMetrics(
      Number(year),
      Number(month)
    )
  }
}
