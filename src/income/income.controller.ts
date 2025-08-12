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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Req
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { IncomeService } from "./income.service"
import { InsertIncomeRequest } from "./dto/income.dto"
import { FileInterceptor } from "@nestjs/platform-express"
import { Income } from "../database/mongoose/schemas/Income"
import { Response } from "express"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("incomes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncomeController {
  constructor(
    private readonly incomeService: IncomeService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "accounting-emp")
  @Post("")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.CREATED)
  async insertIncome(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: InsertIncomeRequest,
    @Req() req
  ): Promise<{ success: true }> {
    await this.incomeService.insertIncome({ ...body, file })
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "inserted",
        entity: "income",
        result: "success",
        meta: { type: body.type, fileSize: file?.size }
      },
      req.user.userId
    )
    return { success: true }
  }

  @Roles("admin", "accounting-emp")
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIncomeByDate(
    @Query("date") date: string,
    @Req() req
  ): Promise<void> {
    await this.incomeService.deleteIncomeByDate(new Date(date))
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "deleted_by_date",
        entity: "income",
        result: "success",
        meta: { date }
      },
      req.user.userId
    )
  }

  @Roles("admin", "accounting-emp")
  @Post("update-affiliate")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.OK)
  async updateAffiliateType(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<{ success: true }> {
    await this.incomeService.updateAffiliateType({ file })
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "update_affiliate",
        entity: "income",
        result: "success",
        meta: { fileSize: file?.size }
      },
      req.user.userId
    )
    return { success: true }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
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
    @Query("date") date: string,
    @Req() req
  ): Promise<{ success: true }> {
    await this.incomeService.updateIncomesBox(new Date(date))
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "update_box",
        entity: "income",
        result: "success",
        meta: { date }
      },
      req.user.userId
    )
    return { success: true }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("export-xlsx")
  async exportIncomesToXlsx(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Res() res: Response,
    @Query("productSource") productSource?: string,
    @Query("productCode") productCode?: string,
    @Query("orderId") orderId?: string,
    @Req() req?
  ): Promise<void> {
    await this.incomeService.exportIncomesToXlsx(
      new Date(startDate),
      new Date(endDate),
      res,
      productSource,
      productCode,
      orderId
    )
    // best-effort log (no await)
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "export_xlsx",
        entity: "income",
        result: "success",
        meta: { startDate, endDate, productSource, productCode, orderId }
      },
      (req as any)?.user?.userId ?? "unknown"
    )
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("income-split-by-month")
  @HttpCode(HttpStatus.OK)
  async totalIncomeByMonthSplit(
    @Query("month") month: string,
    @Query("year") year: string
  ): Promise<{ totalIncome: { live: number; shop: number } }> {
    const totalIncome = await this.incomeService.totalIncomeByMonthSplit(
      Number(month),
      Number(year)
    )
    return { totalIncome }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("quantity-split-by-month")
  @HttpCode(HttpStatus.OK)
  async totalQuantityByMonthSplit(
    @Query("month") month: string,
    @Query("year") year: string
  ): Promise<{ totalQuantity: { live: number; shop: number } }> {
    const totalQuantity = await this.incomeService.totalQuantityByMonthSplit(
      Number(month),
      Number(year)
    )
    return { totalQuantity }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("kpi-percentage-split-by-month")
  @HttpCode(HttpStatus.OK)
  async KPIPercentageByMonthSplit(
    @Query("month") month: string,
    @Query("year") year: string
  ): Promise<{ KPIPercentage: { live: number; shop: number } }> {
    const KPIPercentage = await this.incomeService.KPIPercentageByMonthSplit(
      Number(month),
      Number(year)
    )
    return { KPIPercentage }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("daily-stats")
  @HttpCode(HttpStatus.OK)
  async getDailyStats(@Query("date") date: string): Promise<{
    boxes: { box: string; quantity: number }[]
    totalIncome: number
    sources: {
      ads: number
      affiliate: number
      affiliateAds: number
      other: number
    }
  }> {
    const res = await this.incomeService.getDailyStats(new Date(date))
    return res
  }
}
