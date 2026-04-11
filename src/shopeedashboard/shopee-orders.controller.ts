import { Controller, Get, HttpCode, HttpStatus, Query, UseGuards } from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { ShopeeOrdersService } from "./shopee-orders.service"
import { OrdersQueryDto } from "./dto/orders-query.dto"

@Controller("shopee/orders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopeeOrdersController {
  constructor(private readonly shopeeOrdersService: ShopeeOrdersService) {}

  @Roles("admin", "shopee-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getOrders(@Query() query: OrdersQueryDto) {
    return this.shopeeOrdersService.getOrders(query)
  }
}
