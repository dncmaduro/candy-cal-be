import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { MonthlyShopeeDashboardService } from "./monthly-shopee-dashboard.service"
import { MonthlySummaryQueryDto } from "./dto/monthly-summary-query.dto"
import { MonthlyKpisQueryDto } from "./dto/monthly-kpis-query.dto"

@Controller("shopee/incomes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MonthlyShopeeDashboardController {
  constructor(
    private readonly monthlyShopeeDashboardService: MonthlyShopeeDashboardService
  ) {}

  @Roles("admin", "shopee-emp", "system-emp")
  @Get("monthly-summary")
  @HttpCode(HttpStatus.OK)
  async getMonthlySummary(@Query() query: MonthlySummaryQueryDto) {
    return this.monthlyShopeeDashboardService.getMonthlySummary(query)
  }

  @Roles("admin", "shopee-emp", "system-emp")
  @Get("monthly-kpis")
  @HttpCode(HttpStatus.OK)
  async getMonthlyKpis(@Query() query: MonthlyKpisQueryDto) {
    return this.monthlyShopeeDashboardService.getMonthlyKpis(query)
  }
}
