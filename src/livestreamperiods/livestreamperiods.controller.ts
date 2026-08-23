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
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("livestreamperiods")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LivestreamperiodsController {
  constructor(
    private readonly livestreamperiodsService: LivestreamperiodsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Permissions()
  @Get("by-channel/:channelId")
  @HttpCode(HttpStatus.OK)
  async getPeriodIdsByChannel(@Param("channelId") channelId: string) {
    return this.livestreamperiodsService.getPeriodIdsByChannel(channelId)
  }

  @Permissions()
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

  @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllLivestreamPeriods() {
    return this.livestreamperiodsService.getAllLivestreamPeriods()
  }

  @Permissions()
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getLivestreamPeriodById(@Param("id") id: string) {
    return this.livestreamperiodsService.getLivestreamPeriodById(id)
  }

  @Permissions()
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

  @Permissions()
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
