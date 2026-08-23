import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { SalesDailyReportsService } from "./salesdailyreports.service"
import { SalesDailyReport } from "../database/mongoose/schemas/SalesDailyReport"
import { SalesMonthKpi } from "../database/mongoose/schemas/SalesMonthKpi"
import { SalesDailyAds } from "../database/mongoose/schemas/SalesDailyAds"
import { SalesDailyAdsService } from "../salesdailyads/salesdailyads.service"

@Controller("salesdailyreports")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesDailyReportsController {
  constructor(
    private readonly salesDailyReportsService: SalesDailyReportsService,
    private readonly salesDailyAdsService: SalesDailyAdsService
  ) {}

  @Permissions()
  @Get("revenue-for-date")
  @HttpCode(HttpStatus.OK)
  async getRevenueForDate(
    @Query("date") date: string,
    @Query("channelId") channelId: string
  ): Promise<{
    revenue: number
    newFunnelRevenue: {
      ads: number
      other: number
    }
    returningFunnelRevenue: number
    newOrder: number
    returningOrder: number
    accumulatedRevenue: number
    accumulatedNewFunnelRevenue: {
      ads: number
      other: number
    }
  }> {
    return this.salesDailyReportsService.getRevenueForDate(
      new Date(date),
      channelId
    )
  }

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createReport(
    @Body()
    body: {
      date: string
      channel: string
      dateKpi: number
    }
  ): Promise<SalesDailyReport> {
    return this.salesDailyReportsService.createReport({
      ...body,
      date: new Date(body.date)
    })
  }

  @Permissions()
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReport(@Param("id") id: string): Promise<void> {
    await this.salesDailyReportsService.deleteReport(id)
  }

  @Permissions()
  @Get("by-month")
  @HttpCode(HttpStatus.OK)
  async getReportsByMonth(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string,
    @Query("deleted") deleted?: string
  ): Promise<{ data: SalesDailyReport[]; total: number }> {
    return this.salesDailyReportsService.getReportsByMonth(
      Number(month),
      Number(year),
      channelId,
      deleted === "true"
    )
  }

  @Permissions()
  @Get("month-kpi/by-date")
  @HttpCode(HttpStatus.OK)
  async getMonthKpi(
    @Query("date") date: string,
    @Query("channelId") channelId: string
  ): Promise<SalesMonthKpi | null> {
    return this.salesDailyReportsService.getMonthKpi(new Date(date), channelId)
  }

  @Permissions()
  @Get("accumulated-revenue/by-month")
  @HttpCode(HttpStatus.OK)
  async getAccumulatedRevenueForMonth(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId: string
  ): Promise<{ accumulatedRevenue: number }> {
    const accumulatedRevenue =
      await this.salesDailyReportsService.getAccumulatedRevenueForMonth(
        Number(month),
        Number(year),
        channelId
      )
    return { accumulatedRevenue }
  }

  @Permissions()
  @Post("month-kpi")
  @HttpCode(HttpStatus.CREATED)
  async createOrUpdateMonthKpi(
    @Body()
    body: {
      month: number
      year: number
      channel: string
      kpi: number
    }
  ): Promise<SalesMonthKpi> {
    return this.salesDailyReportsService.createOrUpdateMonthKpi(body)
  }

  @Permissions()
  @Get("month-kpi")
  @HttpCode(HttpStatus.OK)
  async getMonthKpis(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("month") month?: string,
    @Query("year") year?: string,
    @Query("channelId") channelId?: string
  ): Promise<{
    data: SalesMonthKpi[]
    total: number
  }> {
    return this.salesDailyReportsService.getMonthKpis(
      page ? Number(page) : 1,
      limit ? Number(limit) : 10,
      month ? Number(month) : undefined,
      year ? Number(year) : undefined,
      channelId
    )
  }

  @Permissions()
  @Get("month-kpi/:id")
  @HttpCode(HttpStatus.OK)
  async getMonthKpiDetail(
    @Param("id") id: string
  ): Promise<SalesMonthKpi | null> {
    return this.salesDailyReportsService.getMonthKpiDetail(id)
  }

  @Permissions()
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getReportDetail(
    @Param("id") id: string
  ): Promise<SalesDailyReport | null> {
    return this.salesDailyReportsService.getReportDetail(id)
  }

  @Permissions()
  @Post("update-reports-in-range")
  @HttpCode(HttpStatus.OK)
  async updateReportsInDateRange(
    @Body("startDate") startDate: string,
    @Body("endDate") endDate: string,
    @Body("channelId") channelId?: string
  ): Promise<{ updated: number; skipped: number; errors: string[] }> {
    return this.salesDailyReportsService.updateReportsInDateRange(
      new Date(startDate),
      new Date(endDate),
      channelId
    )
  }
}
