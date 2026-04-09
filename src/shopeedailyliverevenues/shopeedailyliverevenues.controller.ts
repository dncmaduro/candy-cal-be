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
import { ShopeeDailyLiveRevenuesService } from "./shopeedailyliverevenues.service"
import {
  CreateShopeeDailyLiveRevenueDto,
  UpdateShopeeDailyLiveRevenueDto
} from "./dto/shopeedailyliverevenues.dto"
import { ShopeeDailyLiveRevenue } from "../database/mongoose/schemas/ShopeeDailyLiveRevenue"

@Controller("shopeedailyliverevenues")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopeeDailyLiveRevenuesController {
  constructor(
    private readonly shopeeDailyLiveRevenuesService: ShopeeDailyLiveRevenuesService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "shopee-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createShopeeDailyLiveRevenue(
    @Body() dto: CreateShopeeDailyLiveRevenueDto,
    @Req() req
  ): Promise<ShopeeDailyLiveRevenue> {
    const created =
      await this.shopeeDailyLiveRevenuesService.createShopeeDailyLiveRevenue(dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_daily_live_revenue",
        action: "created",
        entity: "shopee_daily_live_revenue",
        entityId: created._id.toString(),
        result: "success",
        meta: {
          date: created.date,
          channel: created.channel
        }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "shopee-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getShopeeDailyLiveRevenues(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("channel") channel?: string,
    @Query("date") date?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ): Promise<{ data: ShopeeDailyLiveRevenue[]; total: number }> {
    return this.shopeeDailyLiveRevenuesService.getShopeeDailyLiveRevenues({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      channel,
      date,
      startDate,
      endDate
    })
  }

  @Roles("admin", "shopee-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getShopeeDailyLiveRevenueById(
    @Param("id") id: string
  ): Promise<ShopeeDailyLiveRevenue> {
    return this.shopeeDailyLiveRevenuesService.getShopeeDailyLiveRevenueById(id)
  }

  @Roles("admin", "shopee-emp")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateShopeeDailyLiveRevenue(
    @Param("id") id: string,
    @Body() dto: UpdateShopeeDailyLiveRevenueDto,
    @Req() req
  ): Promise<ShopeeDailyLiveRevenue> {
    const updated =
      await this.shopeeDailyLiveRevenuesService.updateShopeeDailyLiveRevenue(
        id,
        dto
      )
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_daily_live_revenue",
        action: "updated",
        entity: "shopee_daily_live_revenue",
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
  async deleteShopeeDailyLiveRevenue(@Param("id") id: string, @Req() req) {
    await this.shopeeDailyLiveRevenuesService.deleteShopeeDailyLiveRevenue(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_daily_live_revenue",
        action: "deleted",
        entity: "shopee_daily_live_revenue",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
