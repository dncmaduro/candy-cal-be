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
import { JwtAuthGuard } from "src/auth/jwt-auth.guard"
import { RolesGuard } from "src/roles/roles.guard"
import { OrderLogsService } from "./orderlogs.service"
import { Roles } from "src/roles/roles.decorator"
import {
  OrderLog,
  OrderLogItem,
  OrderLogProduct
} from "src/database/mongoose/schemas/OrderLog"
import { OrderLogSessionDto } from "./dto/orderlogs.dto"
import { Types } from "mongoose"

@Controller("orderlogs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrderLogsController {
  constructor(private readonly orderLogsService: OrderLogsService) {}

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
    @Body() sessionDto: OrderLogSessionDto
  ): Promise<OrderLog> {
    return this.orderLogsService.createLogSession(sessionDto)
  }

  @Roles("admin", "order-emp")
  @Get("range")
  @HttpCode(HttpStatus.OK)
  async getOrderLogsByRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("session") session: "morning" | "afternoon" | "all"
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
    return this.orderLogsService.getOrderLogsByRange(
      new Date(startDate),
      new Date(endDate),
      session
    )
  }
}
