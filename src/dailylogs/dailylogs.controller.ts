import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query
} from "@nestjs/common"
import { DailyLogsService } from "./dailylogs.service"
import { Roles } from "../roles/roles.decorator"
import { DailyLogDto } from "./dto/dailylogs.dto"
import { DailyLog } from "../database/mongoose/schemas/DailyLog"

@Controller("dailylogs")
export class DailyLogsController {
  constructor(private readonly dailyLogsService: DailyLogsService) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDailyLog(@Body() dailyLog: DailyLogDto): Promise<void> {
    return this.dailyLogsService.createDailyLog(dailyLog)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getDailyLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: DailyLog[]; total: number }> {
    return this.dailyLogsService.getDailyLogs(page, limit)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("by-date")
  @HttpCode(HttpStatus.OK)
  async getDailyLogByDate(
    @Query("date") date: string
  ): Promise<DailyLog | null> {
    return this.dailyLogsService.getDailyLogByDate(new Date(date))
  }
}
