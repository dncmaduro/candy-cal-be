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
import { CommonOrder } from "src/database/mongoose/schemas/CommonOrder"
import { JwtAuthGuard } from "src/auth/jwt-auth-guard"

@Controller("common-orders")
export class CommonOrdersController {
  constructor(private readonly commonOrdersService: CommonOrdersService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(@Body() commonOrder: CommonOrderDto): Promise<CommonOrder> {
    return this.commonOrdersService.createOrder(commonOrder)
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateOrder(@Body() commonOrder: CommonOrder): Promise<CommonOrder> {
    return this.commonOrdersService.updateOrder(commonOrder)
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllOrders(): Promise<CommonOrder[]> {
    return this.commonOrdersService.getAllOrders()
  }

  @UseGuards(JwtAuthGuard)
  @Get("/order")
  @HttpCode(HttpStatus.OK)
  async getOrder(@Query("id") id: string): Promise<CommonOrder> {
    return this.commonOrdersService.getOrder(id)
  }

  @UseGuards(JwtAuthGuard)
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchOrders(
    @Query("searchText") searchText: string
  ): Promise<CommonOrder[]> {
    return this.commonOrdersService.searchOrders(searchText)
  }
}
