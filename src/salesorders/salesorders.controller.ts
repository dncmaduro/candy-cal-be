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
  UploadedFile,
  HttpException
} from "@nestjs/common"
import { Response } from "express"
import { FileInterceptor } from "@nestjs/platform-express"
import {
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiResponse,
  ApiTags
} from "@nestjs/swagger"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import {
  InventoryExportHandling,
  SalesOrdersService
} from "./salesorders.service"
import {
  SalesOrder,
  SalesOrderDiscountType,
  SalesOrderShippingType,
  SalesOrderStorage,
  SalesOrderStatus
} from "../database/mongoose/schemas/SalesOrder"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("salesorders")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags("Sales orders")
export class SalesOrdersController {
  constructor(
    private readonly salesOrdersService: SalesOrdersService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  private scopeSalesCsToOwnOrders(req: any): boolean {
    return !(req?.user?.permissions || []).includes("sales.orders.read.all")
  }

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Tạo đơn hàng nháp" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["salesFunnelId", "items", "storage", "date"],
      properties: {
        salesFunnelId: { type: "string", example: "65f1234567890abcdef12345" },
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["code", "quantity"],
            properties: {
              code: { type: "string", example: "SP001" },
              quantity: { type: "number", minimum: 1, example: 2 }
            }
          }
        },
        storage: { type: "string", enum: ["position_HaNam", "position_MKT"] },
        date: { type: "string", format: "date-time" },
        orderDiscount: { type: "number", minimum: 0 },
        orderDiscountType: { type: "string", enum: ["percent", "value"] },
        otherDiscount: { type: "number", minimum: 0 },
        deposit: { type: "number", minimum: 0 },
        note: { type: "string" }
      }
    }
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Đơn hàng đã được tạo"
  })
  async createOrder(
    @Body()
    body: {
      salesFunnelId: string
      items: { code: string; quantity: number }[]
      storage: SalesOrderStorage
      date: string
      orderDiscount?: number
      orderDiscountType?: SalesOrderDiscountType
      otherDiscount?: number
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
      orderDiscount: body.orderDiscount,
      orderDiscountType: body.orderDiscountType,
      otherDiscount: body.otherDiscount,
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

  @Permissions()
  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: "Import đơn hàng từ file XLSX" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      required: ["file"],
      properties: { file: { type: "string", format: "binary" } }
    }
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    description: "Kết quả import đơn hàng"
  })
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

  @Permissions()
  @Get("upload/template")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Tải file mẫu import đơn hàng" })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
  @ApiResponse({ status: HttpStatus.OK, description: "File XLSX" })
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

  @Permissions()
  @Patch(":id/items")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cập nhật mặt hàng và chiết khấu đơn nháp" })
  @ApiParam({ name: "id", description: "ID đơn hàng" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["items"],
      properties: {
        items: {
          type: "array",
          minItems: 1,
          items: {
            type: "object",
            required: ["code", "quantity"],
            properties: {
              code: { type: "string" },
              quantity: { type: "number", minimum: 1 }
            }
          }
        },
        storage: { type: "string", enum: ["position_HaNam", "position_MKT"] },
        orderDiscount: { type: "number", minimum: 0 },
        orderDiscountType: { type: "string", enum: ["percent", "value"] },
        otherDiscount: { type: "number", minimum: 0 },
        deposit: { type: "number", minimum: 0 },
        note: { type: "string" }
      }
    }
  })
  async updateOrderItems(
    @Param("id") id: string,
    @Body()
    body: {
      items: {
        code: string
        quantity: number
      }[]
      storage?: SalesOrderStorage
      orderDiscount?: number
      orderDiscountType?: SalesOrderDiscountType
      otherDiscount?: number
      deposit?: number
      note?: string
    },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateOrderItems(
      id,
      body.items,
      body.storage,
      body.orderDiscount,
      body.orderDiscountType,
      body.otherDiscount,
      body.deposit
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

  @Permissions()
  @Patch(":id/date")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cập nhật ngày đơn hàng" })
  @ApiParam({ name: "id", description: "ID đơn hàng" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["date"],
      properties: { date: { type: "string", format: "date-time" } }
    }
  })
  async updateOrderDate(
    @Param("id") id: string,
    @Body() body: { date: string },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateOrderDate(
      id,
      new Date(body.date)
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "updated_date",
        entity: "salesorder",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Permissions()
  @Patch(":id/shipping-tax")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cập nhật thông tin vận chuyển, thuế và phí ship" })
  @ApiParam({ name: "id", description: "ID đơn hàng" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        shippingCode: { type: "string" },
        shippingType: {
          type: "string",
          enum: ["shipping_vtp", "shipping_cargo"]
        },
        tax: { type: "number", minimum: 0 },
        shippingCost: { type: "number", minimum: 0 },
        receivedDate: { type: "string", format: "date-time" }
      }
    }
  })
  async updateShippingAndTax(
    @Param("id") id: string,
    @Body()
    body: {
      shippingCode?: string
      shippingType?: SalesOrderShippingType
      tax?: number
      shippingCost?: number
      receivedDate?: string
    },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.updateShippingAndTax(id, {
      ...body,
      receivedDate: body.receivedDate ? new Date(body.receivedDate) : undefined
    })
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

  @Permissions()
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Xóa đơn hàng chưa chính thức" })
  @ApiParam({ name: "id", description: "ID đơn hàng" })
  @ApiResponse({
    status: HttpStatus.NO_CONTENT,
    description: "Đã xóa đơn hàng"
  })
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

  @Permissions()
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Lấy chi tiết đơn hàng" })
  @ApiParam({ name: "id", description: "ID đơn hàng" })
  async getOrderById(
    @Param("id") id: string,
    @Req() req
  ): Promise<SalesOrder | null> {
    return this.salesOrdersService.getOrderById(
      id,
      this.scopeSalesCsToOwnOrders(req) ? req.user.userId : undefined
    )
  }

  @Permissions()
  @Get("funnel/:funnelId")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Lấy đơn hàng theo sales funnel" })
  @ApiParam({ name: "funnelId", description: "ID sales funnel" })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  async getOrdersByFunnel(
    @Param("funnelId") funnelId: string,
    @Req() req,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{
    data: SalesOrder[]
    total: number
    daysSinceLastPurchase: number | null
    totalRevenue: number
    topProducts: { code: string; name: string; quantity: number }[]
  }> {
    const canViewAll = (req.user.permissions || []).includes(
      "sales.orders.funnel.read.all"
    )
    return this.salesOrdersService.getOrdersByFunnel(
      funnelId,
      req.user.userId,
      canViewAll,
      Number(page),
      Number(limit),
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )
  }

  @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Tìm kiếm và phân trang đơn hàng, bao gồm đơn đã hủy"
  })
  @ApiQuery({ name: "salesFunnelId", required: false, type: String })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "channelId", required: false, type: String })
  @ApiQuery({ name: "returning", required: false, enum: ["true", "false"] })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({ name: "searchText", required: false, type: String })
  @ApiQuery({
    name: "shippingType",
    required: false,
    enum: ["shipping_vtp", "shipping_cargo"]
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["draft", "confirmed", "official", "cancelled"]
  })
  @ApiQuery({ name: "page", required: false, type: Number, example: 1 })
  @ApiQuery({ name: "limit", required: false, type: Number, example: 10 })
  async searchOrders(
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("userId") userId?: string,
    @Query("channelId") channelId?: string,
    @Query("returning") returning?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("searchText") searchText?: string,
    @Query("shippingType") shippingType?: SalesOrderShippingType,
    @Query("status") status?: SalesOrderStatus,
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Req() req: any = undefined
  ): Promise<{ data: SalesOrder[]; total: number }> {
    const effectiveUserId = this.scopeSalesCsToOwnOrders(req)
      ? req.user.userId
      : userId

    return this.salesOrdersService.searchOrders(
      {
        salesFunnelId,
        userId: effectiveUserId,
        channelId,
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

  @Permissions()
  @Patch(":id/storage")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cập nhật kho xuất hàng" })
  @ApiParam({ name: "id", description: "ID đơn hàng" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["storage"],
      properties: {
        storage: { type: "string", enum: ["position_HaNam", "position_MKT"] }
      }
    }
  })
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

  @Permissions()
  @Get("options/storages")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Lấy các kho có thể chọn" })
  async getAllStorages(): Promise<{
    data: Array<{ value: SalesOrderStorage; label: string }>
  }> {
    return this.salesOrdersService.getAllStorages()
  }

  @Permissions()
  @Get("options/shipping-types")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Lấy các loại vận chuyển có thể chọn" })
  async getAllShippingTypes(): Promise<{
    data: Array<{ value: SalesOrderShippingType; label: string }>
  }> {
    return this.salesOrdersService.getAllShippingTypes()
  }

  @Permissions()
  @Get("export/xlsx")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Export đơn hàng ra Excel" })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
  @ApiQuery({ name: "salesFunnelId", required: false, type: String })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "channelId", required: false, type: String })
  @ApiQuery({ name: "returning", required: false, enum: ["true", "false"] })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({ name: "searchText", required: false, type: String })
  @ApiQuery({
    name: "shippingType",
    required: false,
    enum: ["shipping_vtp", "shipping_cargo"]
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["draft", "confirmed", "official", "cancelled"]
  })
  @ApiResponse({ status: HttpStatus.OK, description: "File XLSX" })
  async exportOrdersToExcel(
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("userId") userId?: string,
    @Query("channelId") channelId?: string,
    @Query("returning") returning?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("searchText") searchText?: string,
    @Query("shippingType") shippingType?: SalesOrderShippingType,
    @Query("status") status?: SalesOrderStatus,
    @Req() req?: any,
    @Res() res?: Response
  ): Promise<void> {
    const effectiveUserId = this.scopeSalesCsToOwnOrders(req)
      ? req.user.userId
      : userId
    const buffer = await this.salesOrdersService.exportOrdersToExcel({
      salesFunnelId,
      userId: effectiveUserId,
      channelId,
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

  @Permissions()
  @Get("export/xlsx/accounting")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Export đơn hàng kế toán ra Excel" })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
  @ApiQuery({ name: "salesFunnelId", required: false, type: String })
  @ApiQuery({ name: "userId", required: false, type: String })
  @ApiQuery({ name: "channelId", required: false, type: String })
  @ApiQuery({ name: "returning", required: false, enum: ["true", "false"] })
  @ApiQuery({
    name: "startDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({
    name: "endDate",
    required: false,
    type: String,
    format: "date-time"
  })
  @ApiQuery({ name: "searchText", required: false, type: String })
  @ApiQuery({
    name: "shippingType",
    required: false,
    enum: ["shipping_vtp", "shipping_cargo"]
  })
  @ApiQuery({
    name: "status",
    required: false,
    enum: ["draft", "confirmed", "official", "cancelled"]
  })
  @ApiResponse({ status: HttpStatus.OK, description: "File XLSX" })
  async exportOrdersToExcelForAccounting(
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("userId") userId?: string,
    @Query("channelId") channelId?: string,
    @Query("returning") returning?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("searchText") searchText?: string,
    @Query("shippingType") shippingType?: SalesOrderShippingType,
    @Query("status") status?: SalesOrderStatus,
    @Res() res?: Response
  ): Promise<void> {
    const buffer =
      await this.salesOrdersService.exportOrdersToExcelForAccounting({
        salesFunnelId,
        userId,
        channelId,
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
      })

    const filename = `orders_accounting_${new Date().getTime()}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)
  }

  @Permissions()
  @Patch(":id/status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Chuyển trạng thái đơn hàng hoặc hủy đơn chính thức"
  })
  @ApiParam({ name: "id", description: "ID đơn hàng" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["status"],
      properties: {
        status: {
          type: "string",
          enum: ["draft", "confirmed", "official", "cancelled"]
        },
        shippingCode: {
          type: "string",
          description: "Bắt buộc khi chuyển official"
        },
        shippingType: {
          type: "string",
          enum: ["shipping_vtp", "shipping_cargo"],
          description: "Bắt buộc khi chuyển official"
        },
        tax: {
          type: "number",
          minimum: 0,
          description: "Bắt buộc khi chuyển official"
        },
        shippingCost: {
          type: "number",
          minimum: 0,
          description: "Bắt buộc khi chuyển official"
        },
        receivedDate: { type: "string", format: "date-time" },
        inventoryHandling: {
          type: "string",
          enum: [
            "require_full_stock",
            "export_available_items",
            "skip_inventory_export"
          ],
          description:
            "Bắt buộc/áp dụng khi chuyển official; được lưu để hoàn kho nếu hủy"
        },
        cancelReason: {
          type: "string",
          minLength: 1,
          description: "Bắt buộc khi status là cancelled"
        }
      },
      oneOf: [
        {
          title: "Hủy đơn chính thức",
          required: ["status", "cancelReason"],
          properties: { status: { type: "string", enum: ["cancelled"] } }
        },
        {
          title: "Chuyển đơn sang chính thức",
          required: [
            "status",
            "shippingCode",
            "shippingType",
            "tax",
            "shippingCost"
          ],
          properties: { status: { type: "string", enum: ["official"] } }
        },
        {
          title: "Chuyển giữa nháp và xác nhận",
          required: ["status"],
          properties: {
            status: { type: "string", enum: ["draft", "confirmed"] }
          }
        }
      ],
      examples: {
        cancelOfficialOrder: {
          summary: "Hủy đơn chính thức",
          value: { status: "cancelled", cancelReason: "Khách đổi ý" }
        },
        makeOfficialWithoutExport: {
          summary: "Chuyển chính thức nhưng chưa xuất kho",
          value: {
            status: "official",
            shippingCode: "VTP123456",
            shippingType: "shipping_vtp",
            tax: 0,
            shippingCost: 30000,
            inventoryHandling: "skip_inventory_export"
          }
        }
      }
    }
  })
  async transitionOrderStatus(
    @Param("id") id: string,
    @Body()
    body: {
      status: SalesOrderStatus
      shippingCode?: string
      shippingType?: SalesOrderShippingType
      tax?: number
      shippingCost?: number
      receivedDate?: string
      inventoryHandling?: InventoryExportHandling
      cancelReason?: string
    },
    @Req() req
  ): Promise<SalesOrder> {
    const updated = await this.salesOrdersService.transitionOrderStatus(
      id,
      body.status,
      {
        shippingCode: body.shippingCode,
        shippingType: body.shippingType,
        tax: body.tax,
        shippingCost: body.shippingCost,
        receivedDate: body.receivedDate
          ? new Date(body.receivedDate)
          : undefined,
        inventoryHandling: body.inventoryHandling,
        cancelReason: body.cancelReason
      }
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesorders",
        action: "updated_status",
        entity: "salesorder",
        entityId: updated._id.toString(),
        result: "success",
        meta: {
          status: body.status,
          ...(body.status === "cancelled" && {
            cancelReason: body.cancelReason
          })
        }
      },
      req.user.userId
    )
    return updated
  }

  @Permissions()
  @Post("export/xlsx/by-ids")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Export các đơn được chọn ra Excel" })
  @ApiProduces(
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  )
  @ApiBody({
    schema: {
      type: "object",
      required: ["orderIds"],
      properties: {
        orderIds: { type: "array", minItems: 1, items: { type: "string" } }
      }
    }
  })
  @ApiResponse({ status: HttpStatus.OK, description: "File XLSX" })
  async exportOrdersToExcelByIds(
    @Body() body: { orderIds: string[] },
    @Req() req: any,
    @Res() res: Response
  ): Promise<void> {
    if (!body?.orderIds?.length) {
      throw new HttpException("orderIds is required", HttpStatus.BAD_REQUEST)
    }

    const buffer = await this.salesOrdersService.exportOrdersToExcelByOrderIds(
      body.orderIds,
      this.scopeSalesCsToOwnOrders(req) ? req.user.userId : undefined
    )

    const filename = `orders_${Date.now()}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)
  }
}
