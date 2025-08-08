import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { SessionLogsService } from "./sessionlogs.service"
import { Roles } from "../roles/roles.decorator"
import { SessionLogDto } from "./dto/sessionlogs.dto"
import { SessionLog } from "../database/mongoose/schemas/SessionLog"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"

@Controller("sessionlogs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SessionLogsController {
  constructor(private readonly sessionLogsService: SessionLogsService) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createSessionLog(@Body() sessionLog: SessionLogDto): Promise<void> {
    return this.sessionLogsService.createSessionLog(sessionLog)
  }

  @Roles("admin", "order-emp")
  @Delete("delete")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSessionLog(@Body("id") id: string): Promise<void> {
    return this.sessionLogsService.deleteSessionLog(id)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getSessionLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: SessionLog[]; total: number }> {
    return this.sessionLogsService.getSessionLogs(page, limit)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getSessionLogById(@Query("id") id: string): Promise<SessionLog | null> {
    return this.sessionLogsService.getSessionLogById(id)
  }
}
