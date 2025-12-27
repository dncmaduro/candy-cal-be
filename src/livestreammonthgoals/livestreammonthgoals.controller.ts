import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req
} from "@nestjs/common"
import { LivestreammonthgoalsService } from "./livestreammonthgoals.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("livestreammonthgoals")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreammonthgoalsController {
  constructor(
    private readonly livestreammonthgoalsService: LivestreammonthgoalsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "livestream-leader")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamMonthGoal(
    @Body()
    payload: {
      month: number
      year: number
      channel: string
      goal: number
    },
    @Req() req
  ) {
    const created =
      await this.livestreammonthgoalsService.createLivestreamMonthGoal(payload)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_month_goal",
        action: "created",
        entity: "livestream_month_goal",
        entityId: created._id?.toString?.() ?? "unknown",
        result: "success",
        meta: {
          month: created.month,
          year: created.year,
          channel: created.channel
        }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getLivestreamMonthGoals(
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("channel") channel?: string
  ) {
    return this.livestreammonthgoalsService.getLivestreamMonthGoals(
      page,
      limit,
      channel
    )
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get("kpis")
  @HttpCode(HttpStatus.OK)
  async getLivestreamMonthKpis(
    @Query("month") month: number,
    @Query("year") year: number
  ) {
    return this.livestreammonthgoalsService.getLivestreamMonthKpis(month, year)
  }

  @Roles("admin", "livestream-leader")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateLivestreamMonthGoal(
    @Param("id") id: string,
    @Body() payload: { goal: number },
    @Req() req
  ) {
    const updated =
      await this.livestreammonthgoalsService.updateLivestreamMonthGoal(
        id,
        payload
      )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_month_goal",
        action: "updated",
        entity: "livestream_month_goal",
        entityId: updated._id?.toString?.() ?? id,
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLivestreamMonthGoal(@Param("id") id: string, @Req() req) {
    await this.livestreammonthgoalsService.deleteLivestreamMonthGoal(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_month_goal",
        action: "deleted",
        entity: "livestream_month_goal",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
