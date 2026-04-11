import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  UseGuards
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ShopeeIncomesService } from "./shopeeincomes.service"
import { Roles } from "../roles/roles.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"

@Controller("shopeeincomes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ShopeeIncomesController {
  constructor(private readonly shopeeIncomesService: ShopeeIncomesService) {}

  @Roles("admin", "livestream-leader", "shopee-emp")
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

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "shopee-emp",
    "system-emp"
  )
  @Get("search")
  async searchIncomes(
    @Query("productCode") productCode?: string,
    @Query("variantSku") variantSku?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("channelId") channelId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.shopeeIncomesService.searchIncomes({
      productCode: variantSku || productCode,
      startDate,
      endDate,
      channelId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined
    })
  }
}
