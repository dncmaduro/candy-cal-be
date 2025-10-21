import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors
} from "@nestjs/common"
import { DailyAdsService } from "./dailyads.service"
import { Roles } from "../roles/roles.decorator"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { DailyAdsDto } from "./dto/dailyads.dto"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { FilesInterceptor } from "@nestjs/platform-express"

@Controller("dailyads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DailyAdsController {
  constructor(
    private readonly dailyAdsService: DailyAdsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "accounting-emp", "order-emp")
  @Post()
  @UseInterceptors(FilesInterceptor("files", 6))
  @HttpCode(HttpStatus.CREATED)
  async upsertDailyAds(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req
  ): Promise<void> {
    // Expect 6 files in order:
    // 0 - yesterdayLiveAdsCostFileBefore4pm
    // 1 - yesterdayShopAdsCostFileBefore4pm
    // 2 - yesterdayLiveAdsCostFile
    // 3 - yesterdayShopAdsCostFile
    // 4 - todayLiveAdsCostFileBefore4pm
    // 5 - todayShopAdsCostFileBefore4pm
    if (!files || files.length !== 6) {
      throw new HttpException(
        "Cần upload 6 file chi phí",
        HttpStatus.BAD_REQUEST
      )
    }

    // date can be provided in req.body.date or req.query.date
    const dateStr = req.body?.date || req.query?.date
    if (!dateStr) {
      throw new HttpException(
        "Cần cung cấp ngày (date)",
        HttpStatus.BAD_REQUEST
      )
    }
    const date = new Date(dateStr)
    if (isNaN(date.getTime())) {
      throw new HttpException("Ngày không hợp lệ", HttpStatus.BAD_REQUEST)
    }
    await this.dailyAdsService.createOrUpdateDailyAds(
      files[0],
      files[1],
      files[2],
      files[3],
      files[4],
      files[5],
      date
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "dailyads",
        action: "created/updated",
        entity: "daily_ads",
        result: "success"
      },
      req.user.userId
    )
  }
}
