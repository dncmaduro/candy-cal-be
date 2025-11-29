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
  UseGuards,
  Res,
  UseInterceptors,
  UploadedFile
} from "@nestjs/common"
import { Response } from "express"
import { FileInterceptor } from "@nestjs/platform-express"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesOrdersService } from "./salesorders.service"
import {
  SalesOrder,
  SalesOrderShippingType,
  SalesOrderStorage,
  SalesOrderStatus
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
      discount?: number
      deposit?: number
      note?: string
    },
    @Req() req
  ): Promise<SalesOrder> {
    const created = await this.salesOrdersService.createOrder({
      salesFunnelId: body.salesFunnelId,
      items: body.items,
      storage: body.storage,
      date: new Date(body.date),
      discount: body.discount,
      deposit: body.deposit
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
  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB
      }
    })
  )
  async uploadSalesOrders(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<{
    success: true
    inserted: number
    warnings?: string[]
    totalWarnings?: number
  }> {
    const result = await this.salesOrdersService.uploadSalesOrders(file)

    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "upload",
        entity: "salesorder",
        result: "success",
        meta: {
          fileSize: file?.size,
          inserted: result.inserted
        }
      },
      req.user.userId
    )

    return result
  }

  @Roles("admin", "sales-emp")
  @Get("upload/template")
  @HttpCode(HttpStatus.OK)
  async downloadUploadTemplate(@Res() res: Response): Promise<void> {
    const buffer = await this.salesOrdersService.generateUploadTemplate()

    const filename = `orders_upload_template_${new Date().getTime()}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/items")
  @HttpCode(HttpStatus.OK)
  async updateOrderItems(
    @Param("id") id: string,
    @Body()
    body: {
      items: {
        code: string
        quantity: number
      }[]
      storage?: SalesOrderStorage
      discount?: number
      deposit?: number
      note?: string
    },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateOrderItems(
      id,
      body.items,
      body.storage,
      body.discount,
      body.deposit,
      body.note
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
  @Patch(":id/shipping-tax")
  @HttpCode(HttpStatus.OK)
  async updateShippingAndTax(
    @Param("id") id: string,
    @Body()
    body: {
      shippingCode?: string
      shippingType?: SalesOrderShippingType
      tax?: number
      shippingCost?: number
    },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateShippingAndTax(id, body)
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "updated_shipping_tax",
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

  @Roles("admin", "sales-emp")
  @Get("funnel/:funnelId")
  @HttpCode(HttpStatus.OK)
  async getOrdersByFunnel(
    @Param("funnelId") funnelId: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Req() req
  ): Promise<{
    data: SalesOrder[]
    total: number
    daysSinceLastPurchase: number | null
  }> {
    const isAdmin = req.user.roles?.includes("admin") || false
    return this.salesOrdersService.getOrdersByFunnel(
      funnelId,
      req.user.userId,
      isAdmin,
      Number(page),
      Number(limit)
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async searchOrders(
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("userId") userId?: string,
    @Query("returning") returning?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("searchText") searchText?: string,
    @Query("shippingType") shippingType?: SalesOrderShippingType,
    @Query("status") status?: SalesOrderStatus,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: SalesOrder[]; total: number }> {
    return this.salesOrdersService.searchOrders(
      {
        salesFunnelId,
        userId,
        returning:
          returning === "true"
            ? true
            : returning === "false"
              ? false
              : undefined,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        searchText,
        shippingType,
        status
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

  @Roles("admin", "sales-emp", "system-emp")
  @Get("export/xlsx")
  @HttpCode(HttpStatus.OK)
  async exportOrdersToExcel(
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("userId") userId?: string,
    @Query("returning") returning?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("searchText") searchText?: string,
    @Query("shippingType") shippingType?: SalesOrderShippingType,
    @Query("status") status?: SalesOrderStatus,
    @Res() res?: Response
  ): Promise<void> {
    const buffer = await this.salesOrdersService.exportOrdersToExcel({
      salesFunnelId,
      userId,
      returning:
        returning === "true" ? true : returning === "false" ? false : undefined,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      searchText,
      shippingType,
      status
    })

    const filename = `orders_${new Date().getTime()}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/convert-official")
  @HttpCode(HttpStatus.OK)
  async convertToOfficial(
    @Param("id") id: string,
    @Body() body: { tax: number; shippingCost: number },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.convertToOfficial(
      id,
      body.tax,
      body.shippingCost
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "converted_to_official",
        entity: "salesorder",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }
}
