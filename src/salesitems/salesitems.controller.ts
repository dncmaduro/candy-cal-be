import {
  Controller,
  Post,
  Get,
  HttpCode,
  HttpStatus,
  UploadedFile,
  UseInterceptors,
  UseGuards,
  Req,
  Query,
  Body,
  Param,
  Patch,
  Delete,
  Res
} from "@nestjs/common"
import { Response } from "express"
import { FileInterceptor } from "@nestjs/platform-express"
import { SalesItemsService } from "./salesitems.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import {
  SalesItem,
  SalesItemFactory,
  SalesItemSource
} from "../database/mongoose/schemas/SalesItem"

@Controller("salesitems")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesItemsController {
  constructor(
    private readonly salesItemsService: SalesItemsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Permissions()
  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB
      }
    })
  )
  async uploadSalesItems(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<{
    success: true
    inserted: number
    skipped: number
    warnings?: string[]
    totalWarnings?: number
  }> {
    const result = await this.salesItemsService.uploadSalesItems(file)

    void this.systemLogsService.createSystemLog(
      {
        type: "salesitems",
        action: "upload",
        entity: "salesitem",
        result: "success",
        meta: {
          fileSize: file?.size,
          inserted: result.inserted,
          skipped: result.skipped
        }
      },
      req.user.userId
    )

    return result
  }

  @Permissions()
  @Post("inventory/upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", { limits: { fileSize: 10 * 1024 * 1024 } })
  )
  async uploadInventory(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<{
    success: true
    imported: number
    skipped: number
    uploadBatchId: string
    warnings?: string[]
    totalWarnings?: number
  }> {
    const result = await this.salesItemsService.uploadInventoryFile(
      file,
      req.user.userId
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesitems",
        action: "inventory_import",
        entity: "salesinventory",
        result: "success",
        meta: {
          fileSize: file?.size,
          imported: result.imported,
          uploadBatchId: result.uploadBatchId
        }
      },
      req.user.userId
    )
    return result
  }

  @Permissions()
  @Get("inventory/template")
  @HttpCode(HttpStatus.OK)
  async downloadInventoryTemplate(@Res() res: Response): Promise<void> {
    const buffer =
      await this.salesItemsService.generateInventoryUploadTemplate()
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nhapkho-template.xlsx"`
    )
    res.send(buffer)
  }

  @Permissions()
  @Get("inventory/daily-report")
  @HttpCode(HttpStatus.OK)
  async getDailyInventoryReport(@Query("date") date?: string) {
    return this.salesItemsService.getDailyInventoryReport(
      date ? new Date(date) : new Date()
    )
  }

  @Permissions()
  @Get("inventory/daily-report/xlsx")
  @HttpCode(HttpStatus.OK)
  async downloadDailyInventoryReport(
    @Query("date") date: string | undefined,
    @Res() res: Response
  ): Promise<void> {
    const targetDate = date ? new Date(date) : new Date()
    const buffer =
      await this.salesItemsService.generateDailyInventoryReportXlsx(targetDate)
    const dateLabel = targetDate.toISOString().slice(0, 10)
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="bao-cao-ton-kho-${dateLabel}.xlsx"`
    )
    res.send(buffer)
  }

  @Permissions()
  @Get("inventory/daily-reports")
  @HttpCode(HttpStatus.OK)
  async getInventoryDailyReportHistory(
    @Query("month") month: string,
    @Query("year") year: string
  ) {
    return this.salesItemsService.getInventoryDailyReportHistory(
      Number(month),
      Number(year)
    )
  }

  @Permissions()
  @Get("inventory/history")
  @HttpCode(HttpStatus.OK)
  async getInventoryHistory(
    @Query("code") code?: string,
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "50"
  ) {
    return this.salesItemsService.getInventoryHistory(
      code,
      Number(page),
      Number(limit)
    )
  }

  @Permissions()
  @Get("upload/template")
  @HttpCode(HttpStatus.OK)
  async downloadUploadTemplate(@Res() res: Response): Promise<void> {
    const buffer = await this.salesItemsService.generateUploadTemplate()

    const filename = `salesitems_upload_template_${new Date().getTime()}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)
  }

  @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllSalesItems(
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20"
  ): Promise<{ data: SalesItem[]; total: number }> {
    return this.salesItemsService.getAllSalesItems(Number(page), Number(limit))
  }

  @Permissions()
  @Get("search")
  @HttpCode(HttpStatus.OK)
  async searchSalesItems(
    @Query("searchText") searchText: string,
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20",
    @Query("factory") factory?: SalesItemFactory,
    @Query("source") source?: SalesItemSource
  ): Promise<{ data: SalesItem[]; total: number }> {
    return this.salesItemsService.searchSalesItems(
      searchText,
      Number(page),
      Number(limit),
      factory,
      source
    )
  }

  @Permissions()
  @Get("export/xlsx")
  @HttpCode(HttpStatus.OK)
  async exportSalesItemsToXlsx(
    @Query("searchText") searchText: string = "",
    @Query("factory") factory: SalesItemFactory | undefined,
    @Query("source") source: SalesItemSource | undefined,
    @Res() res: Response,
    @Req() req
  ): Promise<void> {
    const buffer = await this.salesItemsService.exportSalesItemsToXlsx(
      searchText,
      factory,
      source
    )

    const filename = `salesitems_${new Date().getTime()}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)

    void this.systemLogsService.createSystemLog(
      {
        type: "salesitems",
        action: "export_xlsx",
        entity: "salesitem",
        result: "success",
        meta: { searchText, factory, source }
      },
      req.user?.userId ?? "unknown"
    )
  }

  @Permissions()
  @Get("factories")
  @HttpCode(HttpStatus.OK)
  async getAllFactories(): Promise<{
    data: Array<{ value: SalesItemFactory; label: string }>
  }> {
    return this.salesItemsService.getAllFactories()
  }

  @Permissions()
  @Get("sources")
  @HttpCode(HttpStatus.OK)
  async getAllSources(): Promise<{
    data: Array<{ value: SalesItemSource; label: string }>
  }> {
    return this.salesItemsService.getAllSources()
  }

  @Permissions()
  @Post("create")
  @HttpCode(HttpStatus.CREATED)
  async createSalesItem(
    @Body()
    body: {
      code: string
      name: { vn: string; cn: string }
      factory: SalesItemFactory
      price: number
      source: SalesItemSource
      specification?: string
      size?: string
      area?: number
      mass?: number
    },
    @Req() req
  ): Promise<SalesItem> {
    const created = await this.salesItemsService.createSalesItem(body)
    void this.systemLogsService.createSystemLog(
      {
        type: "salesitems",
        action: "created",
        entity: "salesitem",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Permissions()
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getSalesItemById(@Param("id") id: string): Promise<SalesItem | null> {
    return this.salesItemsService.getSalesItemById(id)
  }

  @Permissions()
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async updateSalesItem(
    @Param("id") id: string,
    @Body()
    body: {
      code?: string
      name?: { vn: string; cn: string }
      factory?: SalesItemFactory
      price?: number
      source?: SalesItemSource
      specification?: string
      size?: string
      area?: number
      mass?: number
    },
    @Req() req
  ): Promise<SalesItem> {
    const updated = await this.salesItemsService.updateSalesItem(id, body)
    void this.systemLogsService.createSystemLog(
      {
        type: "salesitems",
        action: "updated",
        entity: "salesitem",
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
  async deleteSalesItem(@Param("id") id: string, @Req() req): Promise<void> {
    await this.salesItemsService.deleteSalesItem(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "salesitems",
        action: "deleted",
        entity: "salesitem",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }

  @Permissions()
  @Get("stats/:code/quantity")
  @HttpCode(HttpStatus.OK)
  async getItemPurchaseQuantity(
    @Param("code") code: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ): Promise<{ code: string; totalQuantity: number; orderCount: number }> {
    return this.salesItemsService.getItemPurchaseQuantity(
      code,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined
    )
  }

  @Permissions()
  @Get("stats/:code/top-customers")
  @HttpCode(HttpStatus.OK)
  async getTopCustomersByItem(
    @Param("code") code: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("limit") limit: string = "10"
  ): Promise<{
    code: string
    topCustomers: Array<{
      funnel: any
      totalQuantity: number
      orderCount: number
    }>
  }> {
    return this.salesItemsService.getTopCustomersByItem(
      code,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      Number(limit)
    )
  }
}
