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
  UploadedFiles
} from "@nestjs/common"
import { FilesInterceptor } from "@nestjs/platform-express"
import { LivestreamperformanceService } from "./livestreamperformance.service"

@Controller("livestreamperformance")
export class LivestreamperformanceController {
  constructor(
    private readonly livestreamperformanceService: LivestreamperformanceService
  ) {}

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

  @Post("calculate-daily")
  async calculateDailyPerformance(@Body() payload: { date: string }) {
    if (!payload.date) {
      return { error: "Date is required" }
    }
    return this.livestreamperformanceService.calculateDailyPerformance(
      new Date(payload.date)
    )
  }

  @Get("monthly-salary")
  async calculateMonthlySalary(
    @Query("year") year: number,
    @Query("month") month: number
  ) {
    if (!year || !month || isNaN(Number(year)) || isNaN(Number(month))) {
      return { error: "Year and month are required and must be valid numbers" }
    }
    return this.livestreamperformanceService.calculateMonthlySalary(
      Number(year),
      Number(month)
    )
  }

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

  @Delete(":id")
  async deletePerformance(@Param("id") id: string) {
    await this.livestreamperformanceService.deletePerformance(id)
    return { success: true }
  }
}
