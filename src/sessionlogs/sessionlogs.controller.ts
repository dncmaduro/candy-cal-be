import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
  Req
} from "@nestjs/common"
import { SessionLogsService } from "./sessionlogs.service"
import { Permissions } from "../permissions/permissions.decorator"
import { SessionLogDto } from "./dto/sessionlogs.dto"
import { SessionLog } from "../database/mongoose/schemas/SessionLog"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("sessionlogs")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SessionLogsController {
  constructor(
    private readonly sessionLogsService: SessionLogsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSessionLog(
    @Body() sessionLog: SessionLogDto,
    @Req() req
  ): Promise<void> {
    await this.sessionLogsService.createSessionLog(sessionLog)
    void this.systemLogsService.createSystemLog(
      {
        type: "dailylogs",
        action: "session_created",
        entity: "session_log",
        result: "success"
      },
      req.user.userId
    )
  }

  @Permissions()
  @Delete("delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSessionLog(@Body("id") id: string, @Req() req): Promise<void> {
    await this.sessionLogsService.deleteSessionLog(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "dailylogs",
        action: "session_deleted",
        entity: "session_log",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }

  @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSessionLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: SessionLog[]; total: number }> {
    return this.sessionLogsService.getSessionLogs(page, limit)
  }

  @Permissions()
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getSessionLogById(@Query("id") id: string): Promise<SessionLog | null> {
    return this.sessionLogsService.getSessionLogById(id)
  }
}
