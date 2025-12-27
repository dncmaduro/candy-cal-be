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
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("livestreamchannels")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamchannelsController {
  constructor(
    private readonly livestreamchannelsService: LivestreamchannelsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "livestream-leader")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamChannel(
    @Body()
    payload: {
      name: string
      username: string
      link: string
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

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "order-emp",
    "accounting-emp"
  )
  @Get("search")
  @HttpCode(HttpStatus.OK)
  async searchLivestreamChannels(
    @Query("searchText") searchText?: string,
    @Query("page") page?: number,
    @Query("limit") limit?: number
  ) {
    return this.livestreamchannelsService.searchLivestreamChannels(
      searchText,
      page,
      limit
    )
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getLivestreamChannelById(@Param("id") id: string) {
    return this.livestreamchannelsService.getLivestreamChannelById(id)
  }

  @Roles("admin", "livestream-leader")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateLivestreamChannel(
    @Param("id") id: string,
    @Body() payload: { name?: string; username?: string; link?: string },
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

  @Roles("admin", "livestream-leader")
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
