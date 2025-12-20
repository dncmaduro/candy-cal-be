import {
  Controller,
  Post,
  Put,
  Patch,
  Get,
  Delete,
  Body,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
  Param,
  Req,
  HttpException
} from "@nestjs/common"
import { LivestreamService } from "./livestream.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { Livestream } from "../database/mongoose/schemas/Livestream"
import { LivestreamPeriod } from "../database/mongoose/schemas/LivestreamPeriod"
import { LivestreamMonthGoal } from "../database/mongoose/schemas/LivestreamGoal"
import { LivestreamAltRequest } from "../database/mongoose/schemas/LivestreamAltRequest"
import { Roles } from "../roles/roles.decorator"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"

@Controller("livestreams")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamController {
  constructor(
    private readonly livestreamService: LivestreamService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "livestream-leader")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLivestream(
    @Body()
    body: {
      date: string
      totalOrders?: number
      totalIncome?: number
      ads?: number
      snapshots?: string[]
    },
    @Req() req
  ): Promise<Livestream> {
    const created = await this.livestreamService.createLivestream({
      date: new Date(body.date),
      totalOrders: body.totalOrders,
      totalIncome: body.totalIncome,
      ads: body.ads,
      snapshots: body.snapshots
    })
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "created",
        entity: "livestream",
        entityId: created._id?.toString?.() ?? "unknown",
        result: "success",
        meta: { date: body.date }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "livestream-leader")
  @Post(":id/snapshots")
  @HttpCode(HttpStatus.CREATED)
  async addSnapshot(
    @Param("id") id: string,
    @Body()
    body: {
      period: string
      assignee?: string
      goal: number
      income?: number
    },
    @Req() req
  ): Promise<Livestream> {
    const updated = await this.livestreamService.addSnapshotToLivestream(
      id,
      body
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "added_snapshot",
        entity: "livestream",
        entityId: id,
        result: "success",
        meta: { period: body.period, assignee: body.assignee }
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
    body: {
      period?: string
      assignee?: string
      goal?: number
      income?: number
    },
    @Req() req
  ): Promise<Livestream> {
    const updated = await this.livestreamService.updateSnapshot(
      livestreamId,
      snapshotId,
      body
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

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Patch(":livestreamId/snapshots/:snapshotId/report")
  @HttpCode(HttpStatus.OK)
  async reportSnapshot(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Body()
    body: {
      income: number
      adsCost: number
      clickRate: number
      avgViewingDuration: number
      comments: number
      ordersNote: string
      rating?: string
    },
    @Req() req
  ): Promise<Livestream> {
    const updated = await this.livestreamService.reportSnapshot(
      livestreamId,
      snapshotId,
      body
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
  @Patch(":livestreamId/snapshots/:snapshotId/alt")
  @HttpCode(HttpStatus.OK)
  async updateSnapshotAlt(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Body()
    body: {
      altAssignee?: string
      altOtherAssignee?: string
      altNote?: string
    },
    @Req() req
  ): Promise<Livestream> {
    const updated = await this.livestreamService.updateSnapshotAlt(
      livestreamId,
      snapshotId,
      body
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
  @Delete(":livestreamId/snapshots/:snapshotId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSnapshot(
    @Param("livestreamId") livestreamId: string,
    @Param("snapshotId") snapshotId: string,
    @Req() req
  ): Promise<void> {
    await this.livestreamService.deleteSnapshot(livestreamId, snapshotId)
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
  @Post(":id/metrics")
  @HttpCode(HttpStatus.OK)
  async setMetrics(
    @Param("id") id: string,
    @Body() body: { totalOrders?: number; totalIncome?: number; ads?: number },
    @Req() req
  ): Promise<Livestream> {
    const updated = await this.livestreamService.setLivestreamMetrics(id, body)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "set_metrics",
        entity: "livestream",
        entityId: id,
        result: "success",
        meta: body
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader")
  @Patch(":id/metrics")
  @HttpCode(HttpStatus.OK)
  async updateMetrics(
    @Param("id") id: string,
    @Body() body: { totalOrders?: number; totalIncome?: number; ads?: number },
    @Req() req
  ): Promise<Livestream> {
    const updated = await this.livestreamService.updateLivestreamMetrics(
      id,
      body
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "updated_metrics",
        entity: "livestream",
        entityId: id,
        result: "success",
        meta: body
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader", "livestream-emp", "order-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getLivestreamsByRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channel") channel?: string,
    @Query("for") forRole?: "host" | "assistant",
    @Query("assignee") assignee?: string
  ): Promise<{ livestreams: Livestream[] }> {
    return this.livestreamService.getLivestreamsByDateRange(
      new Date(startDate),
      new Date(endDate),
      channel,
      forRole,
      assignee
    )
  }

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("aggregated-metrics")
  @HttpCode(HttpStatus.OK)
  async getAggregatedMetrics(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channel") channel?: string,
    @Query("for") forRole?: "host" | "assistant",
    @Query("assignee") assignee?: string
  ): Promise<{
    totalIncome: number
    totalAdsCost: number
    totalComments: number
  }> {
    return this.livestreamService.getAggregatedMetrics(
      new Date(startDate),
      new Date(endDate),
      channel,
      forRole,
      assignee
    )
  }

  @Roles("admin", "livestream-leader")
  @Post("sync-snapshots")
  @HttpCode(HttpStatus.OK)
  async syncSnapshots(
    @Body()
    body: {
      startDate: string
      endDate: string
      channel: string
    },
    @Req() req
  ): Promise<{ updated: number; message: string }> {
    const result = await this.livestreamService.syncSnapshots(
      new Date(body.startDate),
      new Date(body.endDate),
      body.channel
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "sync_snapshots",
        entity: "livestream",
        entityId: "bulk",
        result: "success",
        meta: {
          startDate: body.startDate,
          endDate: body.endDate,
          channel: body.channel,
          updated: result.updated
        }
      },
      req.user.userId
    )
    return result
  }

  @Roles("admin", "livestream-leader")
  @Patch("fix")
  @HttpCode(HttpStatus.OK)
  async fixLivestream(
    @Body() body: { startDate: string; endDate: string; channel: string },
    @Req() req
  ): Promise<{ updated: number; message: string }> {
    const start = new Date(body.startDate)
    const end = new Date(body.endDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      throw new HttpException("Invalid date range", HttpStatus.BAD_REQUEST)
    }

    let totalUpdated = 0
    const fixedDates: string[] = []

    // Loop through each day in the range
    for (
      let cur = new Date(start);
      cur.getTime() <= end.getTime();
      cur.setDate(cur.getDate() + 1)
    ) {
      const updated = await this.livestreamService.fixLivestreamByDate(
        new Date(cur),
        body.channel
      )
      if (updated > 0) {
        totalUpdated += updated
        fixedDates.push(new Date(cur).toISOString().split("T")[0])
      }
    }

    if (totalUpdated === 0) {
      throw new HttpException(
        "No livestreams found for this channel or all are already fixed in the date range",
        HttpStatus.NOT_FOUND
      )
    }

    void this.systemLogsService.createSystemLog(
      {
        type: "livestream",
        action: "fixed",
        entity: "livestream",
        entityId: "bulk",
        result: "success",
        meta: {
          startDate: body.startDate,
          endDate: body.endDate,
          channel: body.channel,
          updated: totalUpdated
        }
      },
      req.user.userId
    )

    return {
      updated: totalUpdated,
      message: `Successfully fixed ${totalUpdated} livestream(s) for channel across ${fixedDates.length} day(s)`
    }
  }

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("/monthly-totals")
  @HttpCode(HttpStatus.OK)
  async getMonthlyTotals(
    @Query("year") year: string,
    @Query("month") month: string
  ) {
    return this.livestreamService.getMonthlyTotals(Number(year), Number(month))
  }

  @Roles("admin", "livestream-leader")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLivestream(@Param("id") id: string, @Req() req): Promise<void> {
    await this.livestreamService.deleteLivestream(id)
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

  @Roles("admin", "livestream-leader")
  @Post("periods")
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamPeriod(
    @Body()
    body: {
      startTime: { hour: number; minute: number }
      endTime: { hour: number; minute: number }
      channel: string
      for: "host" | "assistant"
    },
    @Req() req
  ): Promise<LivestreamPeriod> {
    const created = await this.livestreamService.createLivestreamPeriod(body)
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

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("periods")
  @HttpCode(HttpStatus.OK)
  async getAllLivestreamPeriods(): Promise<{ periods: LivestreamPeriod[] }> {
    return this.livestreamService.getAllLivestreamPeriods()
  }

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("periods/:id")
  @HttpCode(HttpStatus.OK)
  async getLivestreamPeriodById(
    @Param("id") id: string
  ): Promise<LivestreamPeriod> {
    return this.livestreamService.getLivestreamPeriodById(id)
  }

  @Roles("admin", "livestream-leader")
  @Put("periods/:id")
  @HttpCode(HttpStatus.OK)
  async updateLivestreamPeriod(
    @Param("id") id: string,
    @Body()
    body: {
      startTime?: { hour: number; minute: number }
      endTime?: { hour: number; minute: number }
      channel?: string
      for?: "host" | "assistant"
    },
    @Req() req
  ): Promise<LivestreamPeriod> {
    const updated = await this.livestreamService.updateLivestreamPeriod(
      id,
      body
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
  @Delete("periods/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLivestreamPeriod(
    @Param("id") id: string,
    @Req() req
  ): Promise<void> {
    await this.livestreamService.deleteLivestreamPeriod(id)
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

  @Roles("admin", "livestream-leader")
  @Post("range")
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamRange(
    @Body()
    body: {
      startDate: string
      endDate: string
      channel: string
      totalOrders?: number
      totalIncome?: number
      ads?: number
    },
    @Req() req
  ): Promise<Livestream[]> {
    const start = new Date(body.startDate)
    const end = new Date(body.endDate)
    start.setHours(0, 0, 0, 0)
    end.setHours(0, 0, 0, 0)

    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
      throw new HttpException("Invalid date range", HttpStatus.BAD_REQUEST)
    }

    // Get all period IDs for this channel
    const periodIds = await this.livestreamService.getPeriodIdsByChannel(
      body.channel
    )

    const created: Livestream[] = []
    // iterate inclusive
    for (
      let cur = new Date(start);
      cur.getTime() <= end.getTime();
      cur.setDate(cur.getDate() + 1)
    ) {
      try {
        const doc = await this.livestreamService.createLivestream({
          date: new Date(cur),
          totalOrders: body.totalOrders,
          totalIncome: body.totalIncome,
          ads: body.ads,
          snapshots: periodIds
        })
        created.push(doc)
      } catch (err) {
        // if exists, skip; otherwise rethrow
        if (err instanceof HttpException) {
          const status = (err as HttpException).getStatus()
          if (status === HttpStatus.BAD_REQUEST) {
            // assume conflict for existing livestream; skip
            continue
          }
        }
        throw err
      }
    }

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
          startDate: body.startDate,
          endDate: body.endDate,
          created: created.length
        }
      },
      req.user.userId
    )

    return created
  }

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("stats")
  @HttpCode(HttpStatus.OK)
  async getLivestreamStats(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
  ) {
    return this.livestreamService.getLivestreamStats(
      new Date(startDate),
      new Date(endDate)
    )
  }

  @Roles("admin", "livestream-leader")
  @Post("goals")
  @HttpCode(HttpStatus.CREATED)
  async createMonthGoal(
    @Body()
    body: { month: number; year: number; channel: string; goal: number },
    @Req() req
  ): Promise<LivestreamMonthGoal> {
    const created = await this.livestreamService.createLivestreamMonthGoal(body)
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

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("goals")
  @HttpCode(HttpStatus.OK)
  async getMonthGoals(
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Query("channel") channel?: string
  ): Promise<{ data: LivestreamMonthGoal[]; total: number }> {
    return this.livestreamService.getLivestreamMonthGoals(page, limit, channel)
  }

  @Roles("admin", "livestream-leader")
  @Put("goals/:id")
  @HttpCode(HttpStatus.OK)
  async updateMonthGoal(
    @Param("id") id: string,
    @Body()
    body: { goal: number },
    @Req() req
  ): Promise<LivestreamMonthGoal> {
    const updated = await this.livestreamService.updateLivestreamMonthGoal(
      id,
      body
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
  @Delete("goals/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMonthGoal(@Param("id") id: string, @Req() req): Promise<void> {
    await this.livestreamService.deleteLivestreamMonthGoal(id)
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

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("kpis")
  @HttpCode(HttpStatus.OK)
  async getMonthKpis(
    @Query("month") month: string,
    @Query("year") year: string
  ): Promise<LivestreamMonthGoal[]> {
    const m = Number(month)
    const y = Number(year)
    return this.livestreamService.getLivestreamMonthKpis(m, y)
  }

  @Roles("admin", "livestream-leader")
  @Post("channels")
  @HttpCode(HttpStatus.CREATED)
  async createChannel(
    @Body() body: { name: string; username: string; link: string },
    @Req() req
  ): Promise<LivestreamChannel> {
    const created = await this.livestreamService.createLivestreamChannel(body)
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
    "order-emp",
    "accounting-emp"
  )
  @Get("channels")
  @HttpCode(HttpStatus.OK)
  async searchChannels(
    @Query("searchText") searchText?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: LivestreamChannel[]; total: number }> {
    return this.livestreamService.searchLivestreamChannels(
      searchText,
      Number(page),
      Number(limit)
    )
  }

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("channels/:id")
  @HttpCode(HttpStatus.OK)
  async getChannel(@Param("id") id: string): Promise<LivestreamChannel> {
    return this.livestreamService.getLivestreamChannelById(id)
  }

  @Roles("admin", "livestream-leader")
  @Put("channels/:id")
  @HttpCode(HttpStatus.OK)
  async updateChannel(
    @Param("id") id: string,
    @Body() body: { name?: string; username?: string; link?: string },
    @Req() req
  ): Promise<LivestreamChannel> {
    const updated = await this.livestreamService.updateLivestreamChannel(
      id,
      body
    )
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
  @Delete("channels/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteChannel(@Param("id") id: string, @Req() req): Promise<void> {
    await this.livestreamService.deleteLivestreamChannel(id)
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

  // === ALT REQUEST ENDPOINTS ===

  // 0. Search alt requests
  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("alt-requests/search")
  @HttpCode(HttpStatus.OK)
  async searchAltRequests(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: "pending" | "accepted" | "rejected",
    @Query("channel") channel?: string,
    @Query("requestBy") requestBy?: string
  ): Promise<{ data: LivestreamAltRequest[]; total: number }> {
    return this.livestreamService.searchAltRequests(
      Number(page) || 1,
      Number(limit) || 10,
      status,
      channel,
      requestBy
    )
  }

  // 1. Create alt request
  @Roles("admin", "livestream-leader", "livestream-emp")
  @Post("alt-requests")
  @HttpCode(HttpStatus.CREATED)
  async createAltRequest(
    @Body()
    body: {
      livestreamId: string
      snapshotId: string
      altNote: string
    },
    @Req() req
  ): Promise<LivestreamAltRequest> {
    const created = await this.livestreamService.createAltRequest({
      livestreamId: body.livestreamId,
      snapshotId: body.snapshotId,
      altNote: body.altNote,
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
          livestreamId: body.livestreamId,
          snapshotId: body.snapshotId
        }
      },
      req.user.userId
    )
    return created
  }

  // 2. Update alt request (only creator)
  @Roles("admin", "livestream-leader", "livestream-emp")
  @Put("alt-requests/:id")
  @HttpCode(HttpStatus.OK)
  async updateAltRequest(
    @Param("id") id: string,
    @Body()
    body: {
      altNote: string
    },
    @Req() req
  ): Promise<LivestreamAltRequest> {
    const updated = await this.livestreamService.updateAltRequest(
      id,
      req.user.userId,
      body
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_alt_request",
        action: "updated",
        entity: "livestream_alt_request",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  // 3. Get request by livestream and snapshot
  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("alt-requests")
  @HttpCode(HttpStatus.OK)
  async getRequestBySnapshot(
    @Query("livestreamId") livestreamId: string,
    @Query("snapshotId") snapshotId: string,
    @Req() req
  ): Promise<LivestreamAltRequest | null> {
    return this.livestreamService.getRequestBySnapshot(
      livestreamId,
      snapshotId,
      req.user.userId,
      req.user.roles
    )
  }

  // 4. Update request status (only leader/admin)
  @Roles("admin", "livestream-leader")
  @Patch("alt-requests/:id/status")
  @HttpCode(HttpStatus.OK)
  async updateRequestStatus(
    @Param("id") id: string,
    @Body()
    body: {
      status: "accepted" | "rejected"
      altAssignee?: string
    },
    @Req() req
  ): Promise<LivestreamAltRequest> {
    const updated = await this.livestreamService.updateRequestStatus(id, body)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_alt_request",
        action: "status_updated",
        entity: "livestream_alt_request",
        entityId: id,
        result: "success",
        meta: {
          status: body.status,
          altAssignee: body.altAssignee
        }
      },
      req.user.userId
    )
    return updated
  }

  // 5. Delete alt request (only creator, only if pending)
  @Roles("admin", "livestream-leader", "livestream-emp")
  @Delete("alt-requests/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAltRequest(@Param("id") id: string, @Req() req): Promise<void> {
    await this.livestreamService.deleteAltRequest(id, req.user.userId)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_alt_request",
        action: "deleted",
        entity: "livestream_alt_request",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
