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
import { LivestreamEmployee } from "../database/mongoose/schemas/LivestreamEmployee"
import { LivestreamPeriod } from "../database/mongoose/schemas/LivestreamPeriod"
import { Roles } from "../roles/roles.decorator"

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
      host: string
      assistant: string
      goal: number
      income?: number
      noon?: boolean
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
        meta: { period: body.period, host: body.host }
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
      host?: string
      assistant?: string
      goal?: number
      income?: number
      noon?: boolean
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

  @Roles("admin", "livestream-leader", "order-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getLivestreamsByRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
  ): Promise<{ livestreams: Livestream[] }> {
    return this.livestreamService.getLivestreamsByDateRange(
      new Date(startDate),
      new Date(endDate)
    )
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
  @Post("employees")
  @HttpCode(HttpStatus.CREATED)
  async createLivestreamEmployee(
    @Body() body: { name: string; active?: boolean },
    @Req() req
  ): Promise<LivestreamEmployee> {
    const created = await this.livestreamService.createLivestreamEmployee(body)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_employee",
        action: "created",
        entity: "livestream_employee",
        entityId: created._id?.toString?.() ?? "unknown",
        result: "success",
        meta: { name: created.name }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "livestream-leader")
  @Put("employees/:id")
  @HttpCode(HttpStatus.OK)
  async updateLivestreamEmployee(
    @Param("id") id: string,
    @Body() body: { name?: string; active?: boolean },
    @Req() req
  ): Promise<LivestreamEmployee> {
    const updated = await this.livestreamService.updateLivestreamEmployee(
      id,
      body
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_employee",
        action: "updated",
        entity: "livestream_employee",
        entityId: updated._id?.toString?.() ?? id,
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("employees")
  @HttpCode(HttpStatus.OK)
  async getAllLivestreamEmployees(
    @Query("searchText") searchText?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Query("active") active?: string
  ): Promise<{ data: LivestreamEmployee[]; total: number }> {
    const activeBool =
      typeof active === "string" ? active === "true" : undefined
    return this.livestreamService.getAllLivestreamEmployees(
      searchText,
      page,
      limit,
      activeBool
    )
  }

  @Roles("admin", "livestream-leader", "livestream-emp")
  @Get("employees/employee")
  @HttpCode(HttpStatus.OK)
  async getLivestreamEmployee(
    @Query("id") id: string
  ): Promise<LivestreamEmployee> {
    return this.livestreamService.getLivestreamEmployeeById(id)
  }

  @Roles("admin", "livestream-leader")
  @Delete("employees/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLivestreamEmployee(
    @Param("id") id: string,
    @Req() req
  ): Promise<void> {
    await this.livestreamService.deleteLivestreamEmployee(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "livestream_employee",
        action: "deleted",
        entity: "livestream_employee",
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
      noon?: boolean
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
        meta: { channel: created.channel }
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
      noon?: boolean
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
      totalOrders?: number
      totalIncome?: number
      ads?: number
      snapshots?: string[]
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
          snapshots: body.snapshots
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
}
