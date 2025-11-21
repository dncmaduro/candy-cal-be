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
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { FilesInterceptor } from "@nestjs/platform-express"
import { SimpleDailyAdsDto } from "./dto/dailyads.dto"

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

    // currency can be vnd or usd, default to vnd
    const currency = (
      req.body?.currency ||
      req.query?.currency ||
      "vnd"
    ).toLowerCase()
    if (currency !== "vnd" && currency !== "usd") {
      throw new HttpException(
        "Currency phải là 'vnd' hoặc 'usd'",
        HttpStatus.BAD_REQUEST
      )
    }

    await this.dailyAdsService.createOrUpdateDailyAds(
      files[0],
      files[1],
      files[2],
      files[3],
      files[4],
      files[5],
      date,
      currency as "vnd" | "usd"
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

  @Roles("admin", "accounting-emp", "order-emp")
  @Post("/update-with-saved-before4pm")
  @UseInterceptors(FilesInterceptor("files", 4))
  @HttpCode(HttpStatus.OK)
  async updateDailyAdsUsingSavedBefore4pm(
    @UploadedFiles() files: Express.Multer.File[],
    @Req() req
  ): Promise<void> {
    // Expect 4 files in order:
    // 0 - yesterdayLiveAdsCostFile
    // 1 - yesterdayShopAdsCostFile
    // 2 - todayLiveAdsCostFileBefore4pm
    // 3 - todayShopAdsCostFileBefore4pm
    if (!files || files.length !== 4) {
      throw new HttpException(
        "Cần upload 4 file chi phí",
        HttpStatus.BAD_REQUEST
      )
    }

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

    // currency can be vnd or usd, default to vnd
    const currency = (
      req.body?.currency ||
      req.query?.currency ||
      "vnd"
    ).toLowerCase()
    if (currency !== "vnd" && currency !== "usd") {
      throw new HttpException(
        "Currency phải là 'vnd' hoặc 'usd'",
        HttpStatus.BAD_REQUEST
      )
    }

    await this.dailyAdsService.updateDailyAdsUsingSavedBefore4pm(
      files[0],
      files[1],
      files[2],
      files[3],
      date,
      currency as "vnd" | "usd"
    )

    void this.systemLogsService.createSystemLog(
      {
        type: "dailyads",
        action: "updated-with-saved-before4pm",
        entity: "daily_ads",
        result: "success"
      },
      req.user.userId
    )
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Get("/before4pm")
  @HttpCode(HttpStatus.OK)
  async getBefore4pmCosts(@Query("date") dateStr: string) {
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

    const result = await this.dailyAdsService.getBefore4pmCosts(date)

    if (!result) {
      throw new HttpException(
        "Không tìm thấy dữ liệu cho ngày này",
        HttpStatus.NOT_FOUND
      )
    }

    return result
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Post("/simpledailyads")
  @HttpCode(HttpStatus.OK)
  async simpleCreateOrUpdateDailyAds(
    @Body() dto: SimpleDailyAdsDto,
    @Req() req
  ): Promise<{ success: boolean; data: any }> {
    if (!dto.date) {
      throw new HttpException(
        "Cần cung cấp ngày (date)",
        HttpStatus.BAD_REQUEST
      )
    }

    const date = new Date(dto.date)
    if (isNaN(date.getTime())) {
      throw new HttpException("Ngày không hợp lệ", HttpStatus.BAD_REQUEST)
    }

    if (dto.liveAdsCost === undefined || dto.liveAdsCost === null) {
      throw new HttpException(
        "Cần cung cấp liveAdsCost",
        HttpStatus.BAD_REQUEST
      )
    }

    if (dto.shopAdsCost === undefined || dto.shopAdsCost === null) {
      throw new HttpException(
        "Cần cung cấp shopAdsCost",
        HttpStatus.BAD_REQUEST
      )
    }

    const currency = (dto.currency || "vnd").toLowerCase()
    if (currency !== "vnd" && currency !== "usd") {
      throw new HttpException(
        "Currency phải là 'vnd' hoặc 'usd'",
        HttpStatus.BAD_REQUEST
      )
    }

    const result = await this.dailyAdsService.simpleCreateOrUpdateDailyAds(
      date,
      Number(dto.liveAdsCost),
      Number(dto.shopAdsCost),
      currency as "vnd" | "usd",
      dto.channel
    )

    void this.systemLogsService.createSystemLog(
      {
        type: "dailyads",
        action: "simple_create_update",
        entity: "daily_ads",
        result: "success",
        meta: {
          date: dto.date,
          liveAdsCost: dto.liveAdsCost,
          shopAdsCost: dto.shopAdsCost,
          currency
        }
      },
      req.user.userId
    )

    return { success: true, data: result }
  }
}
