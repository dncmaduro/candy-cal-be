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
import { SalesTasksService } from "./salestasks.service"
import { SalesTask } from "../database/mongoose/schemas/SalesTask"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("salestasks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesTasksController {
  constructor(
    private readonly salesTasksService: SalesTasksService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "sales-leader")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createTask(
    @Body()
    body: {
      salesFunnelId: string
      type: "call" | "message" | "other"
      activityId?: string
      deadline: Date
      note?: string
    },
    @Req() req
  ): Promise<SalesTask> {
    const created = await this.salesTasksService.createTask(body)

    void this.systemLogsService.createSystemLog(
      {
        type: "salestasks",
        action: "created",
        entity: "salestask",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )

    return created
  }

  @Roles("admin", "sales-leader", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllTasks(
    @Query("page") page: string = "1",
    @Query("limit") limit: string = "20",
    @Query("assigneeId") assigneeId?: string,
    @Query("salesFunnelId") salesFunnelId?: string,
    @Query("completed") completed?: string
  ): Promise<{ data: SalesTask[]; total: number }> {
    return this.salesTasksService.getAllTasks(
      Number(page),
      Number(limit),
      assigneeId,
      salesFunnelId,
      completed !== undefined ? completed === "true" : undefined
    )
  }

  @Roles("admin", "sales-leader", "sales-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getTaskById(@Param("id") id: string): Promise<SalesTask> {
    return this.salesTasksService.getTaskById(id)
  }

  @Roles("admin", "sales-leader", "sales-emp")
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async updateTask(
    @Param("id") id: string,
    @Body()
    body: {
      type?: "call" | "message" | "other"
      assigneeId?: string
      activityId?: string
      deadline?: Date
      note?: string
    },
    @Req() req
  ): Promise<SalesTask> {
    const updated = await this.salesTasksService.updateTask(id, body)

    void this.systemLogsService.createSystemLog(
      {
        type: "salestasks",
        action: "updated",
        entity: "salestask",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )

    return updated
  }

  @Roles("admin", "sales-leader", "sales-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTask(@Param("id") id: string, @Req() req): Promise<void> {
    await this.salesTasksService.deleteTask(id)

    void this.systemLogsService.createSystemLog(
      {
        type: "salestasks",
        action: "deleted",
        entity: "salestask",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }

  @Roles("admin", "sales-leader", "sales-emp")
  @Post(":id/complete")
  @HttpCode(HttpStatus.OK)
  async completeTask(@Param("id") id: string, @Req() req): Promise<SalesTask> {
    const completed = await this.salesTasksService.completeTask(id)

    void this.systemLogsService.createSystemLog(
      {
        type: "salestasks",
        action: "completed",
        entity: "salestask",
        entityId: completed._id.toString(),
        result: "success"
      },
      req.user.userId
    )

    return completed
  }
}
