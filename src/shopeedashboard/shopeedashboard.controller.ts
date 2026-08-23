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
import { ShopeeDashboardService } from "./shopeedashboard.service"

@Controller("shopeedashboard")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopeeDashboardController {
  constructor(private readonly shopeeDashboardService: ShopeeDashboardService) {}

  @Permissions()
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
