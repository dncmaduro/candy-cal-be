import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards
} from "@nestjs/common"
import { CommonOrdersService } from "./commonOrders.service"
import { CommonOrderDto } from "./dto/commonOrder.dto"
import { CommonOrder } from "../database/mongoose/schemas/CommonOrder"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"

@Controller("common-orders")
@UseGuards(JwtAuthGuard)
export class CommonOrdersController {
  constructor(private readonly commonOrdersService: CommonOrdersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() commonOrder: CommonOrderDto): Promise<CommonOrder> {
    return this.commonOrdersService.createOrder(commonOrder)
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateOrder(@Body() commonOrder: CommonOrder): Promise<CommonOrder> {
    return this.commonOrdersService.updateOrder(commonOrder)
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllOrders(): Promise<CommonOrder[]> {
    return this.commonOrdersService.getAllOrders()
  }

  @Get("/order")
  @HttpCode(HttpStatus.OK)
  async getOrder(@Query("id") id: string): Promise<CommonOrder> {
    return this.commonOrdersService.getOrder(id)
  }

  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchOrders(
    @Query("searchText") searchText: string
  ): Promise<CommonOrder[]> {
    return this.commonOrdersService.searchOrders(searchText)
  }
}
