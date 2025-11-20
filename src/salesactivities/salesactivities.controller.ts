import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesActivitiesService } from "./salesactivities.service"
import { SalesActivity } from "../database/mongoose/schemas/SalesActivity"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("salesactivities")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesActivitiesController {
  constructor(
    private readonly salesActivitiesService: SalesActivitiesService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "sales-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createActivity(
    @Body()
    body: {
      time: string
      type: "call" | "message" | "other"
      note?: string
      salesFunnelId: string
    },
    @Req() req
  ): Promise<SalesActivity> {
    const created = await this.salesActivitiesService.createActivity(
      {
        time: new Date(body.time),
        type: body.type,
        note: body.note,
        salesFunnelId: body.salesFunnelId
      },
      req.user.userId
    )

    void this.systemLogsService.createSystemLog(
      {
        type: "salesactivities",
        action: "created",
        entity: "salesactivity",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )

    return created
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllActivities(
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20",
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("type") type?: "call" | "message" | "other"
  ): Promise<{ data: SalesActivity[]; total: number }> {
    return this.salesActivitiesService.getAllActivities(
      Number(page),
      Number(limit),
      salesFunnelId,
      type
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("funnel/:salesFunnelId/latest")
  @HttpCode(HttpStatus.OK)
  async getLatestActivitiesByFunnel(
    @Param("salesFunnelId") salesFunnelId: string,
    @Query("limit") limit: string = "5"
  ): Promise<SalesActivity[]> {
    return this.salesActivitiesService.getLatestActivitiesByFunnel(
      salesFunnelId,
      Number(limit)
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getActivityById(@Param("id") id: string): Promise<SalesActivity> {
    return this.salesActivitiesService.getActivityById(id)
  }

  @Roles("admin", "sales-emp")
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async updateActivity(
    @Param("id") id: string,
    @Body()
    body: {
      time?: string
      type?: "call" | "message" | "other"
      note?: string
    },
    @Req() req
  ): Promise<SalesActivity> {
    const updated = await this.salesActivitiesService.updateActivity(
      id,
      {
        time: body.time ? new Date(body.time) : undefined,
        type: body.type,
        note: body.note
      },
      req.user.userId
    )

    void this.systemLogsService.createSystemLog(
      {
        type: "salesactivities",
        action: "updated",
        entity: "salesactivity",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )

    return updated
  }

  @Roles("admin", "sales-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteActivity(@Param("id") id: string, @Req() req): Promise<void> {
    await this.salesActivitiesService.deleteActivity(id)

    void this.systemLogsService.createSystemLog(
      {
        type: "salesactivities",
        action: "deleted",
        entity: "salesactivity",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
