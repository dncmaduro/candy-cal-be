import {
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
  Body
} from "@nestjs/common"
import { FileInterceptor } from "@nestjs/platform-express"
import { ShopeeIncomesService } from "./shopeeincomes.service"
import { Roles } from "../roles/roles.decorator"

@Controller("shopeeincomes")
export class ShopeeIncomesController {
  constructor(private readonly shopeeIncomesService: ShopeeIncomesService) {}

  @Roles("admin", "livestream-leader")
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

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get("search")
  async searchIncomes(
    @Query("productCode") productCode?: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("channelId") channelId?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.shopeeIncomesService.searchIncomes({
      productCode,
      startDate,
      endDate,
      channelId,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined
    })
  }
}
