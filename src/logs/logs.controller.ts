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
import { LogsService } from "./logs.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { Log, LogProduct } from "../database/mongoose/schemas/Log"
import { LogDto } from "./dto/log.dto"
import { Types } from "mongoose"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("logs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogsController {
  constructor(
    private readonly logsService: LogsService,
    private readonly systemLogsService: SystemLogsService // Ensure SystemLogsService is injected
  ) {}

  @Roles("admin", "order-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: Log[]; total: number }> {
    return this.logsService.getLogs(page, limit)
  }

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLog(@Body() log: LogDto, @Req() req): Promise<Log> {
    const created = await this.logsService.createLog(log)
    void this.systemLogsService.createSystemLog(
      {
        type: "orders",
        action: "log_created",
        entity: "order_log",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "order-emp", "system-emp")
  @Get("range")
  @HttpCode(HttpStatus.OK)
  async getLogsByRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Req() req
  ): Promise<{
    startDate: Date
    endDate: Date
    items: { _id: Types.ObjectId; quantity: number }[]
    orders: { products: LogProduct[]; quantity: number }[]
    total: number
  }> {
    const res = await this.logsService.getLogsByRange(
      new Date(startDate),
      new Date(endDate)
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "orders",
        action: "logs_range_queried",
        entity: "order_logs",
        result: "success",
        meta: { startDate, endDate }
      },
      req.user.userId
    )
    return res
  }
}
