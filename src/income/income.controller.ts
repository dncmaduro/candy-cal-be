import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { IncomeService } from "./income.service"
import { InsertIncomeRequest } from "./dto/income.dto"
import { FileInterceptor } from "@nestjs/platform-express"
import { Income } from "../database/mongoose/schemas/Income"

@Controller("incomes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncomeController {
  constructor(private readonly incomeService: IncomeService) {}

  @Roles("admin", "accounting-emp")
  @Post("")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.CREATED)
  async insertIncome(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: InsertIncomeRequest
  ): Promise<{ success: true }> {
    await this.incomeService.insertIncome({ ...body, file })
    return { success: true }
  }

  @Roles("admin", "accounting-emp")
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIncomeByDate(@Query("date") date: string): Promise<void> {
    await this.incomeService.deleteIncomeByDate(new Date(date))
  }

  @Roles("admin", "accounting-emp")
  @Post("update-affiliate")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.OK)
  async updateAffiliateType(
    @UploadedFile() file: Express.Multer.File
  ): Promise<{ success: true }> {
    await this.incomeService.updateAffiliateType({ file })
    return { success: true }
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getIncomesByDateRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Query("orderId") orderId?: string,
    @Query("productCode") productCode?: string,
    @Query("productSource") productSource?: string
  ): Promise<{ incomes: Income[]; total: number }> {
    const data = await this.incomeService.getIncomesByDateRange(
      new Date(startDate),
      new Date(endDate),
      Number(page),
      Number(limit),
      orderId,
      productCode,
      productSource
    )
    return data
  }

  @Roles("admin", "accounting-emp")
  @Patch("update-box")
  @HttpCode(HttpStatus.OK)
  async updateIncomesBox(
    @Query("date") date: string
  ): Promise<{ success: true }> {
    await this.incomeService.updateIncomesBox(new Date(date))
    return { success: true }
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Get("total-income-by-month")
  @HttpCode(HttpStatus.OK)
  async totalIncomeByMonth(@Query("month") month: string) {
    const total = await this.incomeService.totalIncomeByMonth(Number(month))
    return { total }
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Get("total-quantity-by-month")
  @HttpCode(HttpStatus.OK)
  async totalQuantityByMonth(@Query("month") month: string) {
    const total = await this.incomeService.totalQuantityByMonth(Number(month))
    return { total }
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Get("kpi-percentage-by-month")
  @HttpCode(HttpStatus.OK)
  async KPIPercentageByMonth(
    @Query("month") month: string,
    @Query("year") year: string
  ) {
    const percentage = await this.incomeService.KPIPercentageByMonth(
      Number(month),
      Number(year)
    )
    return { percentage }
  }
}
