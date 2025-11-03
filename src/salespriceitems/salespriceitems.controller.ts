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
import { SalesPriceItemsService } from "./salespriceitems.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import {
  CreateSalesPriceItemDto,
  UpdateSalesPriceItemDto
} from "./dto/salespriceitems.dto"
import { SalesPriceItem } from "../database/mongoose/schemas/SalesPriceItem"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("salespriceitems")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesPriceItemsController {
  constructor(
    private readonly salesPriceItemsService: SalesPriceItemsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "sales-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSalesPriceItem(
    @Body() dto: CreateSalesPriceItemDto,
    @Req() req
  ): Promise<SalesPriceItem> {
    const created = await this.salesPriceItemsService.createSalesPriceItem(dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "sales",
        action: "created",
        entity: "sales_price_item",
        entityId: created._id.toString(),
        result: "success",
        meta: { itemId: created.itemId?.toString?.() }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "sales-emp")
  @Put()
  @HttpCode(HttpStatus.OK)
  async updateSalesPriceItem(
    @Body() dto: UpdateSalesPriceItemDto,
    @Req() req
  ): Promise<SalesPriceItem> {
    const updated = await this.salesPriceItemsService.updateSalesPriceItem(dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "sales",
        action: "updated",
        entity: "sales_price_item",
        entityId: updated._id.toString(),
        result: "success",
        meta: { itemId: updated.itemId?.toString?.() }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSalesPriceItems(
    @Query("page") page = "1",
    @Query("limit") limit = "20"
  ) {
    const p = parseInt(page as string, 10) || 1
    const l = parseInt(limit as string, 10) || 20
    return this.salesPriceItemsService.getSalesPriceItems(p, l)
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("/item")
  @HttpCode(HttpStatus.OK)
  async getSalesPriceItemByItemId(
    @Query("id") id: string
  ): Promise<SalesPriceItem> {
    return this.salesPriceItemsService.getSalesPriceItemByItemId(id)
  }

  @Roles("admin", "sales-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSalesPriceItem(
    @Param("id") id: string,
    @Req() req
  ): Promise<void> {
    await this.salesPriceItemsService.deleteSalesPriceItem(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "sales",
        action: "deleted",
        entity: "sales_price_item",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
