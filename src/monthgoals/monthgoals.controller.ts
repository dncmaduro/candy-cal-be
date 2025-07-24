import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { MonthGoalService } from "./monthgoals.service"
import { CreateMonthGoalDto, UpdateMonthGoalDto } from "./dto/monthgoals.dto"
import { MonthGoal } from "../database/mongoose/schemas/MonthGoal"

@Controller("monthgoals")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MonthGoalController {
  constructor(private readonly monthGoalService: MonthGoalService) {}

  @Roles("admin", "accounting-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createGoal(@Body() dto: CreateMonthGoalDto): Promise<MonthGoal> {
    return this.monthGoalService.createGoal(dto)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("year")
  @HttpCode(HttpStatus.OK)
  async getGoals(
    @Query("year") year?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ monthGoals: MonthGoal[]; total: number }> {
    return this.monthGoalService.getGoals(year ? Number(year) : undefined)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("month")
  @HttpCode(HttpStatus.OK)
  async getGoal(
    @Query("year") year: string,
    @Query("month") month: string
  ): Promise<MonthGoal | null> {
    return this.monthGoalService.getGoal(Number(month), Number(year))
  }

  @Roles("admin", "accounting-emp")
  @Patch("")
  @HttpCode(HttpStatus.OK)
  async updateGoal(@Body() dto: UpdateMonthGoalDto): Promise<MonthGoal> {
    return this.monthGoalService.updateGoal(dto.month, dto.year, dto)
  }

  @Roles("admin", "accounting-emp")
  @Delete("")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGoal(@Query("year") year: string, @Query("month") month: string) {
    await this.monthGoalService.deleteGoal(Number(month), Number(year))
  }
}
