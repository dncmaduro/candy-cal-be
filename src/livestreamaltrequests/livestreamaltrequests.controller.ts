import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Patch
} from "@nestjs/common"
import { LivestreamaltrequestsService } from "./livestreamaltrequests.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("livestreamaltrequests")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamaltrequestsController {
  constructor(
    private readonly livestreamaltrequestsService: LivestreamaltrequestsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("search")
  @HttpCode(HttpStatus.OK)
  async searchAltRequests(
    @Req() req,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
    @Query("status") status?: "pending" | "accepted" | "rejected",
    @Query("channel") channel?: string,
    @Query("requestBy") requestBy?: string
  ) {
    return this.livestreamaltrequestsService.searchAltRequests(
      page,
      limit,
      status,
      channel,
      requestBy,
      req.user.userId,
      req.user.roles
    )
  }

  @Roles("livestream-emp", "livestream-ast", "livestream-leader")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createAltRequest(
    @Body()
    payload: {
      livestreamId: string
      snapshotId: string
      altNote: string
    },
    @Req() req
  ) {
    const created = await this.livestreamaltrequestsService.createAltRequest({
      ...payload,
      createdBy: req.user.userId
    })
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_alt_request",
        action: "created",
        entity: "livestream_alt_request",
        entityId: created._id?.toString?.() ?? "unknown",
        result: "success",
        meta: {
          livestreamId: payload.livestreamId,
          snapshotId: payload.snapshotId
        }
      },
      req.user.userId
    )
    return created
  }

  @Roles("livestream-emp", "livestream-ast", "livestream-leader")
  @Put(":requestId")
  @HttpCode(HttpStatus.OK)
  async updateAltRequest(
    @Param("requestId") requestId: string,
    @Body() payload: { altNote: string },
    @Req() req
  ) {
    const updated = await this.livestreamaltrequestsService.updateAltRequest(
      requestId,
      req.user.userId,
      { altNote: payload.altNote }
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_alt_request",
        action: "updated",
        entity: "livestream_alt_request",
        entityId: requestId,
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles(
    "admin",
    "livestream-leader",
    "livestream-emp",
    "livestream-ast",
    "livestream-accounting"
  )
  @Get("by-snapshot/:livestreamId/:snapshotId")
  @HttpCode(HttpStatus.OK)
  async getRequestBySnapshot(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Req() req
  ) {
    return this.livestreamaltrequestsService.getRequestBySnapshot(
      livestreamId,
      snapshotId,
      req.user.userId
    )
  }

  @Roles("admin", "livestream-leader")
  @Patch(":requestId/status")
  @HttpCode(HttpStatus.OK)
  async updateRequestStatus(
    @Param("requestId") requestId: string,
    @Body() payload: { status: "accepted" | "rejected"; altAssignee?: string },
    @Req() req
  ) {
    const updated = await this.livestreamaltrequestsService.updateRequestStatus(
      requestId,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_alt_request",
        action: "status_updated",
        entity: "livestream_alt_request",
        entityId: requestId,
        result: "success",
        meta: {
          status: payload.status,
          altAssignee: payload.altAssignee
        }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "livestream-ast")
  @Delete(":requestId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAltRequest(@Param("requestId") requestId: string, @Req() req) {
    await this.livestreamaltrequestsService.deleteAltRequest(
      requestId,
      req.user.userId
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_alt_request",
        action: "deleted",
        entity: "livestream_alt_request",
        entityId: requestId,
        result: "success"
      },
      req.user.userId
    )
  }
}
