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

  @Get("export-xlsx")
  async exportIncomesToXlsx(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Res() res: Response,
    @Query("productSource") productSource?: string,
    @Query("productCode") productCode?: string,
    @Query("orderId") orderId?: string,
    @Req() req?
  ) {
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
}
