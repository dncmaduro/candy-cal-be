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
import { ItemsService } from "./items.service"
import { ItemDto } from "./dto/item.dto"
import { Item } from "src/database/mongoose/schemas/Item"
import { JwtAuthGuard } from "src/auth/jwt-auth-guard"

@Controller("items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createItem(@Body() item: ItemDto): Promise<Item> {
    return this.itemsService.createItem(item)
  }

  @UseGuards(JwtAuthGuard)
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateItem(@Body() item: Item): Promise<Item> {
    return this.itemsService.updateItem(item)
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllItems(): Promise<Item[]> {
    return this.itemsService.getAllItems()
  }

  @UseGuards(JwtAuthGuard)
  @Get("/item")
  @HttpCode(HttpStatus.OK)
  async getItem(@Query("id") id: string): Promise<Item> {
    return this.itemsService.getItem(id)
  }

  @UseGuards(JwtAuthGuard)
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchItems(@Query("searchText") searchText: string): Promise<Item[]> {
    return this.itemsService.searchItems(searchText)
  }
}
