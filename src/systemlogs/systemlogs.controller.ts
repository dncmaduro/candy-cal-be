import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { SystemLogsService } from "./systemlogs.service"
import { SystemLogsDto } from "./dto/systemlogs.dto"
import { SystemLog } from "../database/mongoose/schemas/SystemLog"

@Controller("systemlogs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SystemLogsController {
  constructor(private readonly systemLogsService: SystemLogsService) {}

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSystemLog(
    @Body() systemLog: SystemLogsDto,
    @Req() req
  ): Promise<SystemLog> {
    // enrich with request info if not provided
    if (!systemLog.ip) systemLog.ip = req.ip || req.headers["x-forwarded-for"]
    if (!systemLog.userAgent) systemLog.userAgent = req.headers["user-agent"]
    return this.systemLogsService.createSystemLog(systemLog, req.user.userId)
  }

  @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSystemLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Query("startTime") startTime?: string,
    @Query("endTime") endTime?: string,
    @Query("userId") userId?: string,
    @Query("type") type?: string,
    @Query("action") action?: string,
    @Query("entity") entity?: string,
    @Query("entityId") entityId?: string,
    @Query("result") result?: "success" | "failed"
  ): Promise<{ data: SystemLog[]; total: number }> {
    const start = startTime ? new Date(startTime) : undefined
    const end = endTime ? new Date(endTime) : undefined
    return this.systemLogsService.getSystemLogs(
      Number(page),
      Number(limit),
      userId,
      type,
      action,
      start,
      end,
      entity,
      entityId,
      result
    )
  }

  // select helpers for FE
  @Permissions()
  @Get("/options/users")
  async listUsers(): Promise<{
    data: { value: string; label: string }[]
  }> {
    const users = await this.systemLogsService.listUsersForSelect()
    return users
  }

  @Permissions()
  @Get("/options/types")
  async listTypes(): Promise<{
    data: { value: string; label: string }[]
  }> {
    const types = await this.systemLogsService.listTypes()
    return types
  }

  @Permissions()
  @Get("/options/actions")
  async listActions(): Promise<{
    data: { value: string; label: string }[]
  }> {
    const actions = await this.systemLogsService.listActions()
    return actions
  }

  @Permissions()
  @Get("/options/entities")
  async listEntities(): Promise<{
    data: { value: string; label: string }[]
  }> {
    const entities = await this.systemLogsService.listEntities()
    return entities
  }

  @Permissions()
  @Get("/options/entity-ids")
  async listEntityIds(
    @Query("entity") entity: string
  ): Promise<{ data: { value: string; label: string }[] }> {
    const ids = await this.systemLogsService.listEntityIdsByEntity(entity)
    return ids
  }

  @Permissions()
  @Delete("cleanup")
  @HttpCode(HttpStatus.OK)
  async cleanup(@Query("days") days = 90): Promise<{ deleted: number }> {
    const deleted = await this.systemLogsService.cleanupOldLogs(Number(days))
    return { deleted }
  }
}
