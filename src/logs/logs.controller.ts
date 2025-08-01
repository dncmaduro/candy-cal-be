import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { LogsService } from "./logs.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { Log, LogProduct } from "../database/mongoose/schemas/Log"
import { LogDto } from "./dto/log.dto"
import { Types } from "mongoose"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"

@Controller("logs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @Roles("admin", "order-emp")
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
  async createLog(@Body() log: LogDto): Promise<Log> {
    return this.logsService.createLog(log)
  }

  @Roles("admin", "order-emp")
  @Get("range")
  @HttpCode(HttpStatus.OK)
  async getLogsByRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
  ): Promise<{
    startDate: Date
    endDate: Date
    items: { _id: Types.ObjectId; quantity: number }[]
    orders: { products: LogProduct[]; quantity: number }[]
    total: number
  }> {
    return this.logsService.getLogsByRange(
      new Date(startDate),
      new Date(endDate)
    )
  }
}
