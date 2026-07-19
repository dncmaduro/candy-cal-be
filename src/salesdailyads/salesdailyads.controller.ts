import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { SalesDailyAds } from "../database/mongoose/schemas/SalesDailyAds"
import { Roles } from "../roles/roles.decorator"
import { RolesGuard } from "../roles/roles.guard"
import { SalesDailyAdsService } from "./salesdailyads.service"

@Controller("salesdailyads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesDailyAdsController {
  constructor(private readonly salesDailyAdsService: SalesDailyAdsService) {}

  @Roles("admin", "sales-hunter", "facebook-ads-emp")
  @Post()
  @HttpCode(HttpStatus.OK)
  async upsertAdsCost(
    @Body() body: { date: string; adsCost: number }
  ): Promise<SalesDailyAds> {
    return this.salesDailyAdsService.upsertAdsCost({
      date: new Date(body.date),
      adsCost: body.adsCost
    })
  }

  @Roles("admin", "sales-cs", "sales-hunter", "system-emp", "facebook-ads-emp")
  @Get("by-month")
  @HttpCode(HttpStatus.OK)
  async getAdsByMonth(
    @Query("month") month: string,
    @Query("year") year: string
  ): Promise<{
    data: Array<Pick<SalesDailyAds, "date" | "adsCost">>
    total: number
  }> {
    return this.salesDailyAdsService.getAdsByMonth(Number(month), Number(year))
  }
}
