import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { ShopeeMonthKpisService } from "./shopeemonthkpis.service"
import {
  CreateShopeeMonthKpiDto,
  UpdateShopeeMonthKpiDto
} from "./dto/shopeemonthkpis.dto"
import { ShopeeMonthKpi } from "../database/mongoose/schemas/ShopeeMonthKpi"

@Controller("shopeemonthkpis")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopeeMonthKpisController {
  constructor(
    private readonly shopeeMonthKpisService: ShopeeMonthKpisService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "shopee-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createShopeeMonthKpi(
    @Body() dto: CreateShopeeMonthKpiDto,
    @Req() req
  ): Promise<ShopeeMonthKpi> {
    const created = await this.shopeeMonthKpisService.createShopeeMonthKpi(dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_month_kpi",
        action: "created",
        entity: "shopee_month_kpi",
        entityId: created._id.toString(),
        result: "success",
        meta: {
          month: created.month,
          year: created.year,
          channel: created.channel
        }
      },
      req.user.userId
    )
    return created
  }

  @Roles(
    "admin",
    "shopee-emp",
    "system-emp"
  )
  @Get()
  @HttpCode(HttpStatus.OK)
  async getShopeeMonthKpis(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("month") month?: string,
    @Query("year") year?: string,
    @Query("channel") channel?: string
  ): Promise<{ data: ShopeeMonthKpi[]; total: number }> {
    return this.shopeeMonthKpisService.getShopeeMonthKpis({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      month: month ? Number(month) : undefined,
      year: year ? Number(year) : undefined,
      channel
    })
  }

  @Roles(
    "admin",
    "shopee-emp",
    "system-emp"
  )
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getShopeeMonthKpiById(@Param("id") id: string): Promise<ShopeeMonthKpi> {
    return this.shopeeMonthKpisService.getShopeeMonthKpiById(id)
  }

  @Roles("admin", "shopee-emp")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateShopeeMonthKpi(
    @Param("id") id: string,
    @Body() dto: UpdateShopeeMonthKpiDto,
    @Req() req
  ): Promise<ShopeeMonthKpi> {
    const updated = await this.shopeeMonthKpisService.updateShopeeMonthKpi(
      id,
      dto
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_month_kpi",
        action: "updated",
        entity: "shopee_month_kpi",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "shopee-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteShopeeMonthKpi(@Param("id") id: string, @Req() req) {
    await this.shopeeMonthKpisService.deleteShopeeMonthKpi(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_month_kpi",
        action: "deleted",
        entity: "shopee_month_kpi",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
