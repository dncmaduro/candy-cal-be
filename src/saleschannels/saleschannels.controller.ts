import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Delete,
  Patch,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesChannelsService } from "./saleschannels.service"
import { SalesChannel } from "../database/mongoose/schemas/SalesChannel"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("saleschannels")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesChannelsController {
  constructor(
    private readonly salesChannelsService: SalesChannelsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "sales-emp", "system-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createChannel(
    @Body() body: { channelName: string; assignedTo?: string },
    @Req() req
  ): Promise<SalesChannel> {
    const created = await this.salesChannelsService.createChannel(body)
    void this.systemLogsService.createSystemLog(
      {
        type: "saleschannels",
        action: "created",
        entity: "saleschannel",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async updateChannel(
    @Param("id") id: string,
    @Body() body: { channelName?: string; assignedTo?: string },
    @Req() req
  ): Promise<SalesChannel> {
    const updated = await this.salesChannelsService.updateChannel(id, body)
    void this.systemLogsService.createSystemLog(
      {
        type: "saleschannels",
        action: "updated",
        entity: "saleschannel",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChannel(@Param("id") id: string, @Req() req): Promise<void> {
    await this.salesChannelsService.deleteChannel(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "saleschannels",
        action: "deleted",
        entity: "saleschannel",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getChannelById(@Param("id") id: string): Promise<SalesChannel | null> {
    return this.salesChannelsService.getChannelById(id)
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async searchChannels(
    @Query("searchText") searchText: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: SalesChannel[]; total: number }> {
    return this.salesChannelsService.searchChannels(
      searchText,
      Number(page),
      Number(limit)
    )
  }

  @Roles("admin", "sales-leader")
  @Post(":id/assign")
  @HttpCode(HttpStatus.OK)
  async assignUser(
    @Param("id") id: string,
    @Body() body: { userId: string | null },
    @Req() req
  ): Promise<SalesChannel> {
    const updated = await this.salesChannelsService.assignUser(id, body.userId)
    void this.systemLogsService.createSystemLog(
      {
        type: "saleschannels",
        action: "assigned",
        entity: "saleschannel",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }
}
