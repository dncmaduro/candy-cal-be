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
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesDailyReportsService } from "./salesdailyreports.service"
import { SalesDailyReport } from "../database/mongoose/schemas/SalesDailyReport"
import { SalesMonthKpi } from "../database/mongoose/schemas/SalesMonthKpi"

@Controller("salesdailyreports")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesDailyReportsController {
  constructor(
    private readonly salesDailyReportsService: SalesDailyReportsService
  ) {}

  @Roles("admin", "sales-emp", "system-emp")
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
    accumulatedAdsCost: number
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

  @Roles("admin", "sales-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createReport(
    @Body()
    body: {
      date: string
      channel: string
      adsCost: number
      dateKpi: number
      revenue: number
      newFunnelRevenue: {
        ads: number
        other: number
      }
      returningFunnelRevenue: number
      newOrder: number
      returningOrder: number
      accumulatedRevenue: number
      accumulatedAdsCost: number
      accumulatedNewFunnelRevenue: {
        ads: number
        other: number
      }
    }
  ): Promise<SalesDailyReport> {
    return this.salesDailyReportsService.createReport({
      ...body,
      date: new Date(body.date)
    })
  }

  @Roles("admin", "sales-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteReport(@Param("id") id: string): Promise<void> {
    await this.salesDailyReportsService.deleteReport(id)
  }

  @Roles("admin", "sales-emp", "system-emp")
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

  @Roles("admin", "sales-emp", "system-emp")
  @Get("month-kpi/by-date")
  @HttpCode(HttpStatus.OK)
  async getMonthKpi(
    @Query("date") date: string,
    @Query("channelId") channelId: string
  ): Promise<SalesMonthKpi | null> {
    return this.salesDailyReportsService.getMonthKpi(new Date(date), channelId)
  }

  @Roles("admin", "sales-emp", "system-emp")
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

  @Roles("admin", "sales-emp")
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

  @Roles("admin", "sales-emp", "system-emp")
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

  @Roles("admin", "sales-emp", "system-emp")
  @Get("month-kpi/:id")
  @HttpCode(HttpStatus.OK)
  async getMonthKpiDetail(
    @Param("id") id: string
  ): Promise<SalesMonthKpi | null> {
    return this.salesDailyReportsService.getMonthKpiDetail(id)
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getReportDetail(
    @Param("id") id: string
  ): Promise<SalesDailyReport | null> {
    return this.salesDailyReportsService.getReportDetail(id)
  }
}
