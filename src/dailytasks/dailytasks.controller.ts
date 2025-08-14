import {
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Body,
  Query,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
  Delete
} from "@nestjs/common"
import { DailyTasksService } from "./dailytasks.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import {
  CreateTaskDefDto,
  UpdateTaskDefDto,
  DailyTasksResponseDto,
  TaskDefDto,
  AllUsersDailyTasksResponseDto
} from "./dto/dailytasks.dto"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("dailytasks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DailyTasksController {
  constructor(
    private readonly dailyTasksService: DailyTasksService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  // user: get today tasks
  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Get("me")
  @HttpCode(HttpStatus.OK)
  async myTasks(@Req() req): Promise<{ data: DailyTasksResponseDto }> {
    const userId = req.user.userId
    const data = await this.dailyTasksService.getMyToday(userId)
    return { data }
  }

  // admin: get all users' tasks by date (default today) - return totals only
  @Roles("admin")
  @Get("users")
  @HttpCode(HttpStatus.OK)
  async getAllUsersTasks(
    @Query("date") date?: string
  ): Promise<{ data: AllUsersDailyTasksResponseDto }> {
    const data = await this.dailyTasksService.getAllUsersTasksByDate(date)
    return { data }
  }

  // admin: get user's tasks by date (default today)
  @Roles("admin")
  @Get("users/:userId")
  @HttpCode(HttpStatus.OK)
  async getUserTasks(
    @Param("userId") userId: string,
    @Query("date") date?: string
  ): Promise<{ data: DailyTasksResponseDto }> {
    const data = await this.dailyTasksService.getUserTasksByDate(userId, date)
    return { data }
  }

  // user: mark done
  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Patch(":code/done")
  @HttpCode(HttpStatus.OK)
  async markDone(
    @Req() req,
    @Param("code") code: string
  ): Promise<{ updated: boolean }> {
    const userId = req.user.userId
    const userRole = req.user.role
    const result = await this.dailyTasksService.markDone(userId, code, userRole)
    return { ...result }
  }

  // ADMIN defs CRUD
  @Roles("admin")
  @Get("definitions")
  @HttpCode(HttpStatus.OK)
  async listDefinitions(
    @Query("page") page = "1",
    @Query("limit") limit = "10"
  ): Promise<{ data: TaskDefDto[]; total: number }> {
    const { data, total } = await this.dailyTasksService.listDefinitions(
      Number(page),
      Number(limit)
    )
    return { data, total }
  }

  @Roles("admin")
  @Post("definitions")
  @HttpCode(HttpStatus.CREATED)
  async createDefinition(
    @Body() body: CreateTaskDefDto
  ): Promise<{ data: TaskDefDto }> {
    const doc = await this.dailyTasksService.createDefinition(body)
    return { data: doc }
  }

  @Roles("admin")
  @Patch("definitions/:code")
  @HttpCode(HttpStatus.OK)
  async updateDefinition(
    @Param("code") code: string,
    @Body() body: UpdateTaskDefDto
  ): Promise<{ data: TaskDefDto }> {
    const doc = await this.dailyTasksService.updateDefinition(code, body)
    return { data: doc }
  }

  @Roles("admin")
  @Delete("definitions/:code")
  @HttpCode(HttpStatus.OK)
  async deleteDefinition(
    @Param("code") code: string
  ): Promise<{ deleted: boolean }> {
    const res = await this.dailyTasksService.deleteDefinition(code)
    return { ...res }
  }

  @Roles("admin")
  @Post("generate")
  @HttpCode(HttpStatus.OK)
  async generate(
    @Query("date") date?: string
  ): Promise<{ data: { date: string; tasksCreated: number } }> {
    const res = await this.dailyTasksService.regenerate(date)
    return { data: res }
  }

  // user: recheck http task
  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Patch(":code/recheck")
  @HttpCode(HttpStatus.OK)
  async recheck(
    @Req() req,
    @Param("code") code: string
  ): Promise<{ triggered: boolean }> {
    const userId = req.user.userId
    const triggered = await this.dailyTasksService.manualRecheck(userId, code)
    if (triggered) {
      void this.systemLogsService.createSystemLog(
        {
          type: "task",
          action: "manual_recheck",
          entity: "daily_task",
          result: "success",
          meta: { code }
        },
        userId
      )
    }
    return { triggered }
  }
}
