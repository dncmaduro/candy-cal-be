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
import { ItemsService } from "./items.service"
import { ItemDto } from "./dto/item.dto"
import { Item } from "../database/mongoose/schemas/Item"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("items")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ItemsController {
  constructor(
    private readonly itemsService: ItemsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createItem(@Body() item: ItemDto, @Req() req): Promise<Item> {
    const created = await this.itemsService.createItem(item)
    void this.systemLogsService.createSystemLog(
      {
        type: "items",
        action: "created",
        entity: "item",
        entityId: created._id.toString(),
        result: "success",
        meta: { name: created.name }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "order-emp")
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateItem(@Body() item: Item, @Req() req): Promise<Item> {
    const updated = await this.itemsService.updateItem(item)
    void this.systemLogsService.createSystemLog(
      {
        type: "items",
        action: "updated",
        entity: "item",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
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
  async deleteItem(@Param("id") id: string, @Req() req): Promise<void> {
    await this.itemsService.deleteItem(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "items",
        action: "deleted",
        entity: "item",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
