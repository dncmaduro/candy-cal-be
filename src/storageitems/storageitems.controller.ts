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
import { StorageItemsService } from "./storageitems.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "src/roles/roles.guard"
import { Roles } from "src/roles/roles.decorator"
import { StorageItem } from "src/database/mongoose/schemas/StorageItem"
import { StorageItemDto } from "./dto/storageitems.dto"

@Controller("storageitems")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageItemsController {
  constructor(private readonly storageItemsService: StorageItemsService) {}

  @Roles("admin", "accounting-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createItem(@Body() item: StorageItemDto): Promise<StorageItem> {
    console.log("okela")
    return this.storageItemsService.createItem(item)
  }

  @Roles("admin", "accounting-emp")
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateItem(@Body() item: StorageItem): Promise<StorageItem> {
    return this.storageItemsService.updateItem(item)
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Get("/item")
  @HttpCode(HttpStatus.OK)
  async getItem(@Query("id") id: string): Promise<StorageItem> {
    return this.storageItemsService.getItem(id)
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchItems(
    @Query("searchText") searchText: string
  ): Promise<StorageItem[]> {
    return this.storageItemsService.searchItems(searchText)
  }

  @Roles("admin", "accounting-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteItem(@Param("id") id: string): Promise<void> {
    return this.storageItemsService.deleteItem(id)
  }
}
