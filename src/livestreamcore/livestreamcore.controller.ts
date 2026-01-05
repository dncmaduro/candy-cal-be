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
  Patch,
  Req
} from "@nestjs/common"
import { LivestreamcoreService } from "./livestreamcore.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("livestreamcore")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamcoreController {
  constructor(
    private readonly livestreamcoreService: LivestreamcoreService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "livestream-leader")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLivestream(
    @Body()
    payload: {
      date: Date
      totalOrders?: number
      totalIncome?: number
      ads?: number
      snapshots?: string[]
    },
    @Req() req
  ) {
    const created = await this.livestreamcoreService.createLivestream(payload)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "created",
        entity: "livestream",
        entityId: created._id?.toString?.() ?? "unknown",
        result: "success",
        meta: { date: payload.date }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "livestream-leader")
  @Post("range")
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamRange(
    @Body()
    payload: {
      startDate: string
      endDate: string
      channel: string
      totalOrders?: number
      totalIncome?: number
      ads?: number
    },
    @Req() req
  ) {
    const created = await this.livestreamcoreService.createLivestreamRange({
      startDate: new Date(payload.startDate),
      endDate: new Date(payload.endDate),
      channel: payload.channel,
      totalOrders: payload.totalOrders,
      totalIncome: payload.totalIncome,
      ads: payload.ads
    })
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "created_range",
        entity: "livestream",
        entityId:
          created.length > 0
            ? (created[0]._id?.toString?.() ?? "partial")
            : "none",
        result: "success",
        meta: {
          startDate: payload.startDate,
          endDate: payload.endDate,
          created: created.length
        }
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
    "order-emp"
  )
  @Get("by-date-range")
  @HttpCode(HttpStatus.OK)
  async getLivestreamsByDateRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channel") channel?: string,
    @Query("forRole") forRole?: "host" | "assistant",
    @Query("assigneeId") assigneeId?: string
  ) {
    return this.livestreamcoreService.getLivestreamsByDateRange(
      new Date(startDate),
      new Date(endDate),
      channel,
      forRole,
      assigneeId
    )
  }

  @Roles("admin", "livestream-leader")
  @Post(":livestreamId/snapshots")
  @HttpCode(HttpStatus.CREATED)
  async addSnapshotToLivestream(
    @Param("livestreamId") livestreamId: string,
    @Body()
    payload: {
      period: string
      assignee?: string
      goal: number
      income?: number
    },
    @Req() req
  ) {
    const updated = await this.livestreamcoreService.addSnapshotToLivestream(
      livestreamId,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "added_snapshot",
        entity: "livestream",
        entityId: livestreamId,
        result: "success",
        meta: { period: payload.period, assignee: payload.assignee }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader")
  @Put(":livestreamId/snapshots/:snapshotId")
  @HttpCode(HttpStatus.OK)
  async updateSnapshot(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Body()
    payload: {
      period?: string
      assignee?: string
      goal?: number
      income?: number
    },
    @Req() req
  ) {
    const updated = await this.livestreamcoreService.updateSnapshot(
      livestreamId,
      snapshotId,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "updated_snapshot",
        entity: "livestream",
        entityId: livestreamId,
        result: "success",
        meta: { snapshotId }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader", "livestream-ast")
  @Patch(":livestreamId/snapshots/:snapshotId/report")
  @HttpCode(HttpStatus.OK)
  async reportSnapshot(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Body()
    payload: {
      income: number
      adsCost: number
      clickRate: number
      avgViewingDuration: number
      comments: number
      orders: number
      ordersNote: string
      rating?: string
    },
    @Req() req
  ) {
    const updated = await this.livestreamcoreService.reportSnapshot(
      livestreamId,
      snapshotId,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "reported_snapshot",
        entity: "livestream",
        entityId: livestreamId,
        result: "success",
        meta: { snapshotId }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader")
  @Delete(":livestreamId/snapshots/:snapshotId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSnapshot(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Req() req
  ) {
    await this.livestreamcoreService.deleteSnapshot(livestreamId, snapshotId)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "deleted_snapshot",
        entity: "livestream",
        entityId: livestreamId,
        result: "success",
        meta: { snapshotId }
      },
      req.user.userId
    )
  }

  @Roles("admin", "livestream-leader")
  @Post(":livestreamId/metrics")
  @HttpCode(HttpStatus.OK)
  async setLivestreamMetrics(
    @Param("livestreamId") livestreamId: string,
    @Body()
    payload: { totalOrders?: number; totalIncome?: number; ads?: number },
    @Req() req
  ) {
    const updated = await this.livestreamcoreService.setLivestreamMetrics(
      livestreamId,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "set_metrics",
        entity: "livestream",
        entityId: livestreamId,
        result: "success",
        meta: payload
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader")
  @Post("sync-snapshots")
  @HttpCode(HttpStatus.OK)
  async syncSnapshots(
    @Body()
    payload: {
      startDate: Date
      endDate: Date
      channelId: string
    },
    @Req() req
  ) {
    const result = await this.livestreamcoreService.syncSnapshots(
      payload.startDate,
      payload.endDate,
      payload.channelId
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "sync_snapshots",
        entity: "livestream",
        entityId: "bulk",
        result: "success",
        meta: {
          startDate: payload.startDate,
          endDate: payload.endDate,
          channelId: payload.channelId,
          updated: result.updated
        }
      },
      req.user.userId
    )
    return result
  }

  @Roles("admin", "livestream-leader")
  @Patch("fix-by-date")
  @HttpCode(HttpStatus.OK)
  async fixLivestreamByDate(
    @Body() payload: { date: Date; channelId: string },
    @Req() req
  ) {
    const updated = await this.livestreamcoreService.fixLivestreamByDate(
      payload.date,
      payload.channelId
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "fixed",
        entity: "livestream",
        entityId: "bulk",
        result: "success",
        meta: {
          date: payload.date,
          channelId: payload.channelId,
          updated
        }
      },
      req.user.userId
    )
    return { updated }
  }

  @Roles("admin", "livestream-leader")
  @Patch(":livestreamId/snapshots/:snapshotId/alt")
  @HttpCode(HttpStatus.OK)
  async updateSnapshotAlt(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Body()
    payload: {
      altAssignee?: string | "other"
      altOtherAssignee?: string
      altNote?: string
    },
    @Req() req
  ) {
    const updated = await this.livestreamcoreService.updateSnapshotAlt(
      livestreamId,
      snapshotId,
      payload
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "updated_snapshot_alt",
        entity: "livestream",
        entityId: livestreamId,
        result: "success",
        meta: { snapshotId }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLivestream(@Param("id") id: string, @Req() req) {
    await this.livestreamcoreService.deleteLivestream(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "deleted",
        entity: "livestream",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
