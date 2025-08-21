import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common"
import { DailyAdsService } from "./dailyads.service"
import { Roles } from "../roles/roles.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { DailyAdsDto } from "./dto/dailyads.dto"
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("dailyads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DailyAdsController {
  constructor(
    private readonly dailyAdsService: DailyAdsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "accounting-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async upsertDailyAds(@Body() dto: DailyAdsDto, @Req() req): Promise<void> {
    await this.dailyAdsService.createOrUpdateDailyAds(dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "dailyads",
        action: "created/updated",
        entity: "daily_ads",
        result: "success"
      },
      req.user.userId
    )
  }
}
