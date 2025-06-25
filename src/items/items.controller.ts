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
  Delete,
  Param
} from "@nestjs/common"
import { ItemsService } from "./items.service"
import { ItemDto } from "./dto/item.dto"
import { Item } from "../database/mongoose/schemas/Item"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"

@Controller("items")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createItem(@Body() item: ItemDto): Promise<Item> {
    return this.itemsService.createItem(item)
  }

  @Roles("admin", "order-emp")
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateItem(@Body() item: Item): Promise<Item> {
    return this.itemsService.updateItem(item)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("/item")
  @HttpCode(HttpStatus.OK)
  async getItem(@Query("id") id: string): Promise<Item> {
    return this.itemsService.getItem(id)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchItems(@Query("searchText") searchText: string): Promise<Item[]> {
    return this.itemsService.searchItems(searchText)
  }

  @Roles("admin", "order-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(@Param("id") id: string): Promise<void> {
    return this.itemsService.deleteItem(id)
  }
}
