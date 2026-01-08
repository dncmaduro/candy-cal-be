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
import { LivestreamperiodsService } from "./livestreamperiods.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("livestreamperiods")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamperiodsController {
  constructor(
    private readonly livestreamperiodsService: LivestreamperiodsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("by-channel/:channelId")
  @HttpCode(HttpStatus.OK)
  async getPeriodIdsByChannel(@Param("channelId") channelId: string) {
    return this.livestreamperiodsService.getPeriodIdsByChannel(channelId)
  }

  @Roles("admin", "livestream-leader")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamPeriod(
    @Body()
    payload: {
      startTime: { hour: number; minute: number }
      endTime: { hour: number; minute: number }
      channel: string
      for: "host" | "assistant"
    },
    @Req() req
  ) {
    const created =
      await this.livestreamperiodsService.createLivestreamPeriod(payload)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_period",
        action: "created",
        entity: "livestream_period",
        entityId: created._id?.toString?.() ?? "unknown",
        result: "success",
        meta: { channel: created.channel, for: created.for }
      },
      req.user.userId
    )
    return created
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllLivestreamPeriods() {
    return this.livestreamperiodsService.getAllLivestreamPeriods()
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getLivestreamPeriodById(@Param("id") id: string) {
    return this.livestreamperiodsService.getLivestreamPeriodById(id)
  }

  @Roles("admin", "livestream-leader")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateLivestreamPeriod(
    @Param("id") id: string,
    @Body()
    payload: {
      startTime?: { hour: number; minute: number }
      endTime?: { hour: number; minute: number }
      channel?: string
      for?: "host" | "assistant"
    },
    @Req() req
  ) {
    const updated = await this.livestreamperiodsService.updateLivestreamPeriod(
      id,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_period",
        action: "updated",
        entity: "livestream_period",
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
  async deleteLivestreamPeriod(@Param("id") id: string, @Req() req) {
    await this.livestreamperiodsService.deleteLivestreamPeriod(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_period",
        action: "deleted",
        entity: "livestream_period",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
