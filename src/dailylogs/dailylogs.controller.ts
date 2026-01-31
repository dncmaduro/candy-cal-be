import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
  Req
} from "@nestjs/common"
import { DailyLogsService } from "./dailylogs.service"
import { Roles } from "../roles/roles.decorator"
import { DailyLogDto } from "./dto/dailylogs.dto"
import { DailyLog } from "../database/mongoose/schemas/DailyLog"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("dailylogs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DailyLogsController {
  constructor(
    private readonly dailyLogsService: DailyLogsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDailyLog(
    @Body() dailyLog: DailyLogDto,
    @Req() req
  ): Promise<void> {
    await this.dailyLogsService.createDailyLog(dailyLog)
    void this.systemLogsService.createSystemLog(
      {
        type: "dailylogs",
        action: "created",
        entity: "daily_log",
        result: "success"
      },
      req.user.userId
    )
  }

  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getDailyLogs(
    @Query("channelId") channelId?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: DailyLog[]; total: number }> {
    return this.dailyLogsService.getDailyLogs(channelId, page, limit)
  }

  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Get("by-date")
  @HttpCode(HttpStatus.OK)
  async getDailyLogByDate(
    @Query("date") date: string,
    @Query("channelId") channelId?: string
  ): Promise<DailyLog | null> {
    return this.dailyLogsService.getDailyLogByDate(new Date(date), channelId)
  }
}
