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
  Param,
  Req
} from "@nestjs/common"
import { StorageItemsService } from "./storageitems.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import { StorageItemDto } from "./dto/storageitems.dto"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("storageitems")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageItemsController {
  constructor(
    private readonly storageItemsService: StorageItemsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "accounting-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createItem(
    @Body() item: StorageItemDto,
    @Req() req
  ): Promise<StorageItem> {
    const created = await this.storageItemsService.createItem(item)
    void this.systemLogsService.createSystemLog(
      {
        type: "storage",
        action: "created",
        entity: "storage_item",
        entityId: created._id.toString(),
        result: "success",
        meta: { name: created.name }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "accounting-emp")
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateItem(
    @Body() item: StorageItem,
    @Req() req
  ): Promise<StorageItem> {
    const updated = await this.storageItemsService.updateItem(item)
    void this.systemLogsService.createSystemLog(
      {
        type: "storage",
        action: "updated",
        entity: "storage_item",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("/item")
  @HttpCode(HttpStatus.OK)
  async getItem(@Query("id") id: string): Promise<StorageItem> {
    return this.storageItemsService.getItem(id)
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
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
  async deleteItem(@Param("id") id: string, @Req() req): Promise<void> {
    await this.storageItemsService.deleteItem(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "storage",
        action: "deleted",
        entity: "storage_item",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
