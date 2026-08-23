import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { MonthGoalService } from "./monthgoals.service"
import { CreateMonthGoalDto, UpdateMonthGoalDto } from "./dto/monthgoals.dto"
import { MonthGoal } from "../database/mongoose/schemas/MonthGoal"

@Controller("monthgoals")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MonthGoalController {
  constructor(private readonly monthGoalService: MonthGoalService) {}

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createGoal(@Body() dto: CreateMonthGoalDto): Promise<MonthGoal> {
    return this.monthGoalService.createGoal(dto)
  }

  @Permissions()
  @Get("year")
  @HttpCode(HttpStatus.OK)
  async getGoals(
    @Query("year") year?: string,
    @Query("channelId") channelId?: string
  ): Promise<{
    monthGoals: {
      month: number
      year: number
      channel?: any
      liveStreamGoal: number
      shopGoal: number
      liveAdsPercentageGoal: number
      shopAdsPercentageGoal: number
      totalIncome: {
        beforeDiscount: { live: number; shop: number }
        afterDiscount: { live: number; shop: number }
      }
      totalQuantity: { live: number; shop: number }
      KPIPercentage: {
        beforeDiscount: { live: number; shop: number }
        afterDiscount: { live: number; shop: number }
      }
      adsPercentage: { live: number; shop: number }
      adsGoalComparison: { live: number; shop: number }
    }[]
    total: number
  }> {
    return this.monthGoalService.getGoals(
      year ? Number(year) : undefined,
      channelId
    )
  }

  @Permissions()
  @Get("month")
  @HttpCode(HttpStatus.OK)
  async getGoal(
    @Query("year") year: string,
    @Query("month") month: string,
    @Query("channelId") channelId?: string
  ): Promise<MonthGoal | null> {
    return this.monthGoalService.getGoal(Number(month), Number(year), channelId)
  }

  @Permissions()
  @Patch("")
  @HttpCode(HttpStatus.OK)
  async updateGoal(@Body() dto: UpdateMonthGoalDto): Promise<MonthGoal> {
    return this.monthGoalService.updateGoal(
      dto.month,
      dto.year,
      dto,
      dto.channel
    )
  }

  @Permissions()
  @Delete("")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGoal(
    @Query("year") year: string,
    @Query("month") month: string,
    @Query("channelId") channelId?: string
  ) {
    await this.monthGoalService.deleteGoal(
      Number(month),
      Number(year),
      channelId
    )
  }
}
