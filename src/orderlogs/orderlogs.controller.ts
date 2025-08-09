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
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { OrderLogsService } from "./orderlogs.service"
import { Roles } from "../roles/roles.decorator"
import {
  OrderLog,
  OrderLogItem,
  OrderLogProduct
} from "../database/mongoose/schemas/OrderLog"
import { OrderLogSessionDto } from "./dto/orderlogs.dto"
import { Types } from "mongoose"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("orderlogs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderLogsController {
  constructor(
    private readonly orderLogsService: OrderLogsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "order-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getOrderLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: OrderLog[]; total: number }> {
    return this.orderLogsService.getOrderLogs(page, limit)
  }

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLogSession(
    @Body() sessionDto: OrderLogSessionDto,
    @Req() req
  ): Promise<OrderLog> {
    const created = await this.orderLogsService.createLogSession(sessionDto)
    void this.systemLogsService.createSystemLog(
      {
        type: "orders",
        action: "log_session_created",
        entity: "order_log_session",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "order-emp")
  @Get("range")
  @HttpCode(HttpStatus.OK)
  async getOrderLogsByRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("session") session: "morning" | "afternoon" | "all",
    @Req() req
  ): Promise<{
    startDate: Date
    endDate: Date
    items: {
      _id: Types.ObjectId
      quantity: number
      storageItems: OrderLogItem["storageItems"]
    }[]
    orders: { products: OrderLogProduct[]; quantity: number }[]
    total: number
  }> {
    const res = await this.orderLogsService.getOrderLogsByRange(
      new Date(startDate),
      new Date(endDate),
      session
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "orders",
        action: "range_queried",
        entity: "order_logs",
        result: "success",
        meta: { startDate, endDate, session }
      },
      req.user.userId
    )
    return res
  }
}
