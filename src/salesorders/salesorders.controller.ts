import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Delete,
  Patch,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesOrdersService } from "./salesorders.service"
import {
  SalesOrder,
  SalesOrderShippingType,
  SalesOrderStorage
} from "../database/mongoose/schemas/SalesOrder"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("salesorders")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesOrdersController {
  constructor(
    private readonly salesOrdersService: SalesOrdersService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "sales-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Body()
    body: {
      salesFunnelId: string
      items: { code: string; quantity: number }[]
      storage: SalesOrderStorage
      date: string
    },
    @Req() req
  ): Promise<SalesOrder> {
    const created = await this.salesOrdersService.createOrder({
      salesFunnelId: body.salesFunnelId,
      items: body.items,
      storage: body.storage,
      date: new Date(body.date)
    })
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "created",
        entity: "salesorder",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/items")
  @HttpCode(HttpStatus.OK)
  async updateOrderItems(
    @Param("id") id: string,
    @Body()
    body: {
      items: { code: string; quantity: number; price?: number }[]
      storage?: SalesOrderStorage
    },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateOrderItems(
      id,
      body.items,
      body.storage
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "updated_items",
        entity: "salesorder",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/shipping")
  @HttpCode(HttpStatus.OK)
  async updateShippingInfo(
    @Param("id") id: string,
    @Body()
    body: { shippingCode?: string; shippingType?: SalesOrderShippingType },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateShippingInfo(
      id,
      body.shippingCode,
      body.shippingType
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "updated_shipping",
        entity: "salesorder",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOrder(@Param("id") id: string, @Req() req): Promise<void> {
    await this.salesOrdersService.deleteOrder(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "deleted",
        entity: "salesorder",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getOrderById(@Param("id") id: string): Promise<SalesOrder | null> {
    return this.salesOrdersService.getOrderById(id)
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async searchOrders(
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("returning") returning?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("searchText") searchText?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: SalesOrder[]; total: number }> {
    return this.salesOrdersService.searchOrders(
      {
        salesFunnelId,
        returning:
          returning === "true"
            ? true
            : returning === "false"
              ? false
              : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        searchText
      },
      Number(page),
      Number(limit)
    )
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/storage")
  @HttpCode(HttpStatus.OK)
  async updateStorage(
    @Param("id") id: string,
    @Body() body: { storage: SalesOrderStorage },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateStorage(
      id,
      body.storage
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "updated_storage",
        entity: "salesorder",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("options/storages")
  @HttpCode(HttpStatus.OK)
  async getAllStorages(): Promise<{
    data: Array<{ value: SalesOrderStorage; label: string }>
  }> {
    return this.salesOrdersService.getAllStorages()
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("options/shipping-types")
  @HttpCode(HttpStatus.OK)
  async getAllShippingTypes(): Promise<{
    data: Array<{ value: SalesOrderShippingType; label: string }>
  }> {
    return this.salesOrdersService.getAllShippingTypes()
  }
}
