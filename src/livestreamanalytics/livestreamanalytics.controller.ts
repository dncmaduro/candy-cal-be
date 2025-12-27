import {
  Controller,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus
} from "@nestjs/common"
import { LivestreamanalyticsService } from "./livestreamanalytics.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"

@Controller("livestreamanalytics")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamanalyticsController {
  constructor(
    private readonly livestreamanalyticsService: LivestreamanalyticsService
  ) {}

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get("monthly-totals")
  @HttpCode(HttpStatus.OK)
  async getMonthlyTotals(
    @Query("year") year: number,
    @Query("month") month: number
  ) {
    return this.livestreamanalyticsService.getMonthlyTotals(year, month)
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get("stats")
  @HttpCode(HttpStatus.OK)
  async getLivestreamStats(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
  ) {
    return this.livestreamanalyticsService.getLivestreamStats(
      new Date(startDate),
      new Date(endDate)
    )
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get("aggregated-metrics")
  @HttpCode(HttpStatus.OK)
  async getAggregatedMetrics(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channelId") channelId?: string,
    @Query("forRole") forRole?: "host" | "assistant",
    @Query("assigneeId") assigneeId?: string
  ) {
    return this.livestreamanalyticsService.getAggregatedMetrics(
      new Date(startDate),
      new Date(endDate),
      channelId,
      forRole,
      assigneeId
    )
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get("host-revenue-rankings")
  @HttpCode(HttpStatus.OK)
  async getHostRevenueRankings(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
  ) {
    return this.livestreamanalyticsService.getHostRevenueRankings(
      new Date(startDate),
      new Date(endDate)
    )
  }
}
