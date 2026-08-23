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
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import { StorageItemDto } from "./dto/storageitems.dto"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("storageitems")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class StorageItemsController {
  constructor(
    private readonly storageItemsService: StorageItemsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Permissions()
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

  @Permissions()
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

  @Permissions()
  @Get("/item")
  @HttpCode(HttpStatus.OK)
  async getItem(@Query("id") id: string): Promise<StorageItem> {
    return this.storageItemsService.getItem(id)
  }

  @Permissions()
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchItems(
    @Query("searchText") searchText: string,
    @Query("deleted") deleted?: string
  ): Promise<StorageItem[]> {
    let deletedFlag: boolean | undefined = undefined
    if (deleted === "true") deletedFlag = true
    else if (deleted === "false") deletedFlag = false
    return this.storageItemsService.searchItems(searchText, deletedFlag)
  }

  @Permissions()
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

  @Permissions()
  @Post(":id/restore")
  @HttpCode(HttpStatus.OK)
  async restoreItem(@Param("id") id: string, @Req() req): Promise<void> {
    await this.storageItemsService.restoreItem(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "storage",
        action: "restored",
        entity: "storage_item",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
