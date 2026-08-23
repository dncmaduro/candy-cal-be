import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
  UseGuards
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ShopeeIncomesService } from "./shopeeincomes.service"
import { Permissions } from "../permissions/permissions.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("shopeeincomes")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ShopeeIncomesController {
  constructor(
    private readonly shopeeIncomesService: ShopeeIncomesService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Permissions()
  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  async uploadIncomeFile(
    @UploadedFile() file: Express.Multer.File,
    @Body("channel") channel: string
  ) {
    if (!file) {
      return { error: "No file provided" }
    }

    if (!channel) {
      return { error: "Channel ID is required" }
    }

    return this.shopeeIncomesService.insertIncomeFromXlsx({
      incomeFile: file,
      channel
    })
  }

  @Permissions()
  @Get("search")
  async searchIncomes(
    @Query("productCode") productCode?: string,
    @Query("variantSku") variantSku?: string,
    @Query("orderStartDate") orderStartDate?: string,
    @Query("orderEndDate") orderEndDate?: string,
    @Query("channelId") channelId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.shopeeIncomesService.searchIncomes({
      productCode: variantSku || productCode,
      orderStartDate,
      orderEndDate,
      channelId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined
    })
  }

  @Permissions()
  @Delete()
  @HttpCode(HttpStatus.OK)
  async deleteIncomes(
    @Query("orderId") orderId: string | undefined,
    @Query("orderDate") orderDate: string | undefined,
    @Query("orderStartDate") orderStartDate: string | undefined,
    @Query("orderEndDate") orderEndDate: string | undefined,
    @Query("channelId") channelId: string | undefined,
    @Req() req
  ): Promise<{ deletedCount: number }> {
    const result = await this.shopeeIncomesService.deleteIncomes({
      orderId,
      orderDate,
      orderStartDate,
      orderEndDate,
      channelId
    })

    void this.systemLogsService.createSystemLog(
      {
        type: "shopee_incomes",
        action: "deleted",
        entity: "shopee_income",
        result: "success",
        meta: {
          orderId,
          orderDate,
          orderStartDate,
          orderEndDate,
          channelId,
          deletedCount: result.deletedCount
        }
      },
      req.user.userId
    )

    return result
  }
}
