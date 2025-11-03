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
  Query
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { SalesItemsService } from "./salesitems.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import {
  SalesItem,
  SalesItemFactory,
  SalesItemSource
} from "../database/mongoose/schemas/SalesItem"

@Controller("salesitems")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesItemsController {
  constructor(
    private readonly salesItemsService: SalesItemsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

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
  async uploadSalesItems(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<{
    success: true
    inserted: number
    updated: number
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
          updated: result.updated
        }
      },
      req.user.userId
    )

    return result
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllSalesItems(
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20"
  ): Promise<{ data: SalesItem[]; total: number }> {
    return this.salesItemsService.getAllSalesItems(Number(page), Number(limit))
  }

  @Roles("admin", "sales-emp", "system-emp")
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

  @Roles("admin", "sales-emp", "system-emp")
  @Get("factories")
  @HttpCode(HttpStatus.OK)
  async getAllFactories(): Promise<{
    data: Array<{ value: SalesItemFactory; label: string }>
  }> {
    return this.salesItemsService.getAllFactories()
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("sources")
  @HttpCode(HttpStatus.OK)
  async getAllSources(): Promise<{
    data: Array<{ value: SalesItemSource; label: string }>
  }> {
    return this.salesItemsService.getAllSources()
  }
}
