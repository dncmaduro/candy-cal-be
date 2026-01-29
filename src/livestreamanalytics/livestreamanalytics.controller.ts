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

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("monthly-totals")
  @HttpCode(HttpStatus.OK)
  async getMonthlyTotals(
    @Query("year") year: number,
    @Query("month") month: number
  ) {
    return this.livestreamanalyticsService.getMonthlyTotals(year, month)
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
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

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("aggregated-metrics")
  @HttpCode(HttpStatus.OK)
  async getAggregatedMetrics(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channel") channelId?: string,
    @Query("assigneeId") assigneeId?: string
  ) {
    return this.livestreamanalyticsService.getAggregatedMetrics(
      new Date(startDate),
      new Date(endDate),
      channelId,
      assigneeId
    )
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("month-metrics")
  @HttpCode(HttpStatus.OK)
  async getMonthMetrics(
    @Query("year") year: number,
    @Query("month") month: number,
    @Query("channel") channelId?: string,
    @Query("for") forRole?: "host" | "assistant",
    @Query("assigneeId") assigneeId?: string
  ) {
    return this.livestreamanalyticsService.getMonthMetrics(
      year,
      month,
      channelId,
      forRole,
      assigneeId
    )
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("host-revenue-rankings")
  @HttpCode(HttpStatus.OK)
  async getHostRevenueRankings(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channel") channelId?: string
  ) {
    return this.livestreamanalyticsService.getHostRevenueRankings(
      new Date(startDate),
      new Date(endDate),
      channelId
    )
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("host-revenue-rankings-by-month")
  @HttpCode(HttpStatus.OK)
  async getHostRevenueRankingsByMonth(
    @Query("year") year: number,
    @Query("month") month: number,
    @Query("channel") channelId?: string
  ) {
    return this.livestreamanalyticsService.getHostRevenueRankingsByMonth(
      year,
      month,
      channelId
    )
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("assistant-revenue-rankings")
  @HttpCode(HttpStatus.OK)
  async getAssistantRevenueRankings(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channel") channelId?: string
  ) {
    return this.livestreamanalyticsService.getAssistantRevenueRankings(
      new Date(startDate),
      new Date(endDate),
      channelId
    )
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("assistant-revenue-rankings-by-month")
  @HttpCode(HttpStatus.OK)
  async getAssistantRevenueRankingsByMonth(
    @Query("year") year: number,
    @Query("month") month: number,
    @Query("channel") channelId?: string
  ) {
    return this.livestreamanalyticsService.getAssistantRevenueRankingsByMonth(
      year,
      month,
      channelId
    )
  }
}
