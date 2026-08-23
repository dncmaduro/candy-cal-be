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
import { LivestreamchannelsService } from "./livestreamchannels.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("livestreamchannels")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LivestreamchannelsController {
  constructor(
    private readonly livestreamchannelsService: LivestreamchannelsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamChannel(
    @Body()
    payload: {
      name: string
      username: string
      usernames?: string[]
      link: string
      platform: "tiktokshop" | "shopee"
      sortOrder?: number
    },
    @Req() req
  ) {
    const created =
      await this.livestreamchannelsService.createLivestreamChannel(payload)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_channel",
        action: "created",
        entity: "livestream_channel",
        entityId: created._id?.toString?.() ?? "unknown",
        result: "success",
        meta: { username: created.username }
      },
      req.user.userId
    )
    return created
  }

  @Permissions()
  @Get("search")
  @HttpCode(HttpStatus.OK)
  async searchLivestreamChannels(
    @Query("searchText") searchText?: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("platform") platform?: "tiktokshop" | "shopee"
  ) {
    return this.livestreamchannelsService.searchLivestreamChannels(
      searchText,
      page,
      limit,
      platform
    )
  }

  @Permissions()
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getLivestreamChannelById(@Param("id") id: string) {
    return this.livestreamchannelsService.getLivestreamChannelById(id)
  }

  @Permissions()
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateLivestreamChannel(
    @Param("id") id: string,
    @Body()
    payload: {
      name?: string
      username?: string
      usernames?: string[]
      link?: string
      sortOrder?: number
    },
    @Req() req
  ) {
    const updated =
      await this.livestreamchannelsService.updateLivestreamChannel(id, payload)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_channel",
        action: "updated",
        entity: "livestream_channel",
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
  async deleteLivestreamChannel(@Param("id") id: string, @Req() req) {
    await this.livestreamchannelsService.deleteLivestreamChannel(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_channel",
        action: "deleted",
        entity: "livestream_channel",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
