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
import { Permissions } from "../permissions/permissions.decorator"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { SalesDailyAdsService } from "./salesdailyads.service"

@Controller("salesdailyads")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesDailyAdsController {
  constructor(private readonly salesDailyAdsService: SalesDailyAdsService) {}

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.OK)
  async upsertAdsCost(
    @Body()
    body: {
      date: string
      adsCost: number
      newLeads: number
    }
  ): Promise<SalesDailyAds> {
    return this.salesDailyAdsService.upsertAdsCost({
      date: new Date(body.date),
      adsCost: body.adsCost,
      newLeads: body.newLeads
    })
  }

  @Permissions()
  @Get("by-month")
  @HttpCode(HttpStatus.OK)
  async getAdsByMonth(
    @Query("month") month: string,
    @Query("year") year: string
  ): Promise<{
    data: Array<Pick<SalesDailyAds, "date" | "adsCost" | "newLeads">>
    total: number
  }> {
    return this.salesDailyAdsService.getAdsByMonth(
      Number(month),
      Number(year)
    )
  }
}