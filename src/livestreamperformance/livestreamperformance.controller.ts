import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseInterceptors,
  UploadedFiles,
  UseGuards,
  Res
} from "@nestjs/common"
import { FilesInterceptor } from "@nestjs/platform-express"
import { LivestreamperformanceService } from "./livestreamperformance.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { Response } from "express"

@Controller("livestreamperformance")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamperformanceController {
  constructor(
    private readonly livestreamperformanceService: LivestreamperformanceService
  ) {}

  @Roles("admin", "livestream-leader")
  @Post()
  async createPerformance(
    @Body()
    payload: {
      minIncome: number
      maxIncome: number
      salaryPerHour: number
      bonusPercentage: number
    }
  ) {
    return this.livestreamperformanceService.createPerformance(payload)
  }

  @Roles("admin", "livestream-leader")
  @Put(":id")
  async updatePerformance(
    @Param("id") id: string,
    @Body()
    payload: {
      minIncome?: number
      maxIncome?: number
      salaryPerHour?: number
      bonusPercentage?: number
    }
  ) {
    return this.livestreamperformanceService.updatePerformance(id, payload)
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("search")
  async searchPerformances(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("sortOrder") sortOrder?: "asc" | "desc"
  ) {
    return this.livestreamperformanceService.searchPerformances(
      page,
      limit,
      sortOrder
    )
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("by-income")
  async findPerformanceByIncome(@Query("income") income: number) {
    if (!income || isNaN(Number(income))) {
      return { error: "Invalid income parameter" }
    }
    const performance =
      await this.livestreamperformanceService.findPerformanceByIncome(
        Number(income)
      )
    if (!performance) {
      return { message: "No matching performance found for this income" }
    }
    return performance
  }

  @Roles("admin", "livestream-leader")
  @Post("calculate-daily")
  async calculateDailyPerformance(
    @Body() payload: { date: string; baseOnRealIncome?: boolean }
  ) {
    if (!payload.date) {
      return { error: "Date is required" }
    }
    return this.livestreamperformanceService.calculateDailyPerformance(
      new Date(payload.date),
      payload.baseOnRealIncome
    )
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("monthly-salary")
  async calculateMonthlySalary(
    @Query("year") year: number,
    @Query("month") month: number,
    @Query("channelId") channelId?: string
  ) {
    if (!year || !month || isNaN(Number(year)) || isNaN(Number(month))) {
      return { error: "Year and month are required and must be valid numbers" }
    }
    return this.livestreamperformanceService.calculateMonthlySalary(
      Number(year),
      Number(month),
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
  @Get("monthly-salary/export-xlsx")
  async exportMonthlySalaryToXlsx(
    @Query("year") year: number,
    @Query("month") month: number,
    @Query("channelId") channelId: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    if (!year || !month || isNaN(Number(year)) || isNaN(Number(month))) {
      res.status(400).send({
        error: "Year and month are required and must be valid numbers"
      })
      return
    }

    const buffer =
      await this.livestreamperformanceService.exportMonthlySalaryToXlsx(
        Number(year),
        Number(month),
        channelId
      )

    const safeMonth = String(Number(month)).padStart(2, "0")
    const filename = `LuongLivestream_${year}_${safeMonth}${
      channelId ? `_channel_${channelId}` : ""
    }.xlsx`

    res.setHeader("Content-Disposition", `attachment; filename=${filename}`)
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.send(buffer)
  }

  @Roles("admin", "livestream-leader")
  @Post("calculate-real-income")
  @UseInterceptors(FilesInterceptor("files"))
  async calculateRealIncome(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { date: string }
  ) {
    if (!files || files.length !== 2) {
      return {
        error: "Two files are required: total income file and source file"
      }
    }
    if (!body.date) {
      return { error: "Date is required" }
    }
    const [totalIncomeFile, sourceFile] = files
    return this.livestreamperformanceService.calculateRealIncome(
      totalIncomeFile,
      sourceFile,
      new Date(body.date)
    )
  }

  @Roles("admin", "livestream-leader")
  @Delete(":id")
  async deletePerformance(@Param("id") id: string) {
    await this.livestreamperformanceService.deletePerformance(id)
    return { success: true }
  }
}
