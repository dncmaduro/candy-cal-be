import {
  Controller,
  Post,
  Put,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
  Query
} from "@nestjs/common"
import { ItemsService } from "./items.service"
import { ItemDto } from "./dto/item.dto"
import { Item } from "src/database/mongoose/schemas/Item"
import { ObjectId } from "typeorm"

@Controller("items")
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createItem(@Body() item: ItemDto): Promise<Item> {
    return this.itemsService.createItem(item)
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateItem(@Body() item: Item): Promise<Item> {
    return this.itemsService.updateItem(item)
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllItems(): Promise<Item[]> {
    return this.itemsService.getAllItems()
  }

  @Get("/item")
  @HttpCode(HttpStatus.OK)
  async getItem(@Query("id") id: string): Promise<Item> {
    return this.itemsService.getItem(id)
  }

  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchItems(@Query("searchText") searchText: string): Promise<Item[]> {
    return this.itemsService.searchItems(searchText)
  }
}
