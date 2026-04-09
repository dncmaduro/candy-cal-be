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
import { ShopeeDailyAdsService } from "./shopeedailyads.service"
import {
  CreateShopeeDailyAdsDto,
  UpdateShopeeDailyAdsDto
} from "./dto/shopeedailyads.dto"
import { ShopeeDailyAds } from "../database/mongoose/schemas/ShopeeDailyAds"

@Controller("shopeedailyads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopeeDailyAdsController {
  constructor(
    private readonly shopeeDailyAdsService: ShopeeDailyAdsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "shopee-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createShopeeDailyAds(
    @Body() dto: CreateShopeeDailyAdsDto,
    @Req() req
  ): Promise<ShopeeDailyAds> {
    const created = await this.shopeeDailyAdsService.createShopeeDailyAds(dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_daily_ads",
        action: "created",
        entity: "shopee_daily_ads",
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
  async getShopeeDailyAds(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("channel") channel?: string,
    @Query("date") date?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ): Promise<{ data: ShopeeDailyAds[]; total: number }> {
    return this.shopeeDailyAdsService.getShopeeDailyAds({
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
  async getShopeeDailyAdsById(@Param("id") id: string): Promise<ShopeeDailyAds> {
    return this.shopeeDailyAdsService.getShopeeDailyAdsById(id)
  }

  @Roles("admin", "shopee-emp")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateShopeeDailyAds(
    @Param("id") id: string,
    @Body() dto: UpdateShopeeDailyAdsDto,
    @Req() req
  ): Promise<ShopeeDailyAds> {
    const updated = await this.shopeeDailyAdsService.updateShopeeDailyAds(id, dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_daily_ads",
        action: "updated",
        entity: "shopee_daily_ads",
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
  async deleteShopeeDailyAds(@Param("id") id: string, @Req() req) {
    await this.shopeeDailyAdsService.deleteShopeeDailyAds(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_daily_ads",
        action: "deleted",
        entity: "shopee_daily_ads",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
