import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { LogsService } from "./logs.service"
import { JwtAuthGuard } from "src/auth/jwt-auth-guard"
import { Log } from "src/database/mongoose/schemas/Log"
import { LogDto } from "./dto/log.dto"

@Controller("logs")
export class LogsController {
  constructor(private readonly logsService: LogsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  async getLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: Log[]; total: number }> {
    return this.logsService.getLogs(page, limit)
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLog(@Body() log: LogDto): Promise<Log> {
    return this.logsService.createLog(log)
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getLog(@Query("id") id: string): Promise<Log> {
    return this.logsService.getLog(id)
  }
}
