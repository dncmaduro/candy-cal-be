import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { ShopeeOrdersService } from "./shopee-orders.service"
import { OrdersQueryDto } from "./dto/orders-query.dto"

@Controller("shopee/orders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopeeOrdersController {
  constructor(private readonly shopeeOrdersService: ShopeeOrdersService) {}

  @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getOrders(@Query() query: OrdersQueryDto) {
    return this.shopeeOrdersService.getOrders(query)
  }
}
