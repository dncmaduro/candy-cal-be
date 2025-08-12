import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
  Req
} from "@nestjs/common"
import { CommonOrdersService } from "./commonOrders.service"
import { CommonOrderDto } from "./dto/commonOrder.dto"
import { CommonOrder } from "../database/mongoose/schemas/CommonOrder"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"

@Controller("common-orders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommonOrdersController {
  constructor(
    private readonly commonOrdersService: CommonOrdersService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Body() commonOrder: CommonOrderDto,
    @Req() req
  ): Promise<CommonOrder> {
    const created = await this.commonOrdersService.createOrder(commonOrder)
    void this.systemLogsService.createSystemLog(
      {
        type: "orders",
        action: "created",
        entity: "common_order",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateOrder(
    @Body() commonOrder: CommonOrder,
    @Req() req
  ): Promise<CommonOrder> {
    const updated = await this.commonOrdersService.updateOrder(commonOrder)
    void this.systemLogsService.createSystemLog(
      {
        type: "orders",
        action: "updated",
        entity: "common_order",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllOrders(): Promise<CommonOrder[]> {
    return this.commonOrdersService.getAllOrders()
  }

  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Get("/order")
  @HttpCode(HttpStatus.OK)
  async getOrder(@Query("id") id: string): Promise<CommonOrder> {
    return this.commonOrdersService.getOrder(id)
  }

  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchOrders(
    @Query("searchText") searchText: string
  ): Promise<CommonOrder[]> {
    return this.commonOrdersService.searchOrders(searchText)
  }
}
