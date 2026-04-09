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
import { ShopeeDashboardService } from "./shopeedashboard.service"

@Controller("shopeedashboard")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopeeDashboardController {
  constructor(private readonly shopeeDashboardService: ShopeeDashboardService) {}

  @Roles("admin", "shopee-emp", "system-emp")
  @Get("overview")
  @HttpCode(HttpStatus.OK)
  async getOverview(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string
  ) {
    return this.shopeeDashboardService.getOverview(
      Number(month),
      Number(year),
      channelId
    )
  }
}
