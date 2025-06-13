import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  UseGuards
} from "@nestjs/common"
import { StorageLogsService } from "./storagelogs.service"
import { JwtAuthGuard } from "../auth/jwt-auth-guard"
import { StorageLogDto } from "./dto/storagelog.dto"
import { StorageLog } from "../database/mongoose/schemas/StorageLog"
import { GetMonthStorageLogsReponse } from "./dto/month"

@Controller("storagelogs")
export class StorageLogsController {
  constructor(private readonly storageLogsService: StorageLogsService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createStorageLog(
    @Body() storageLog: StorageLogDto
  ): Promise<StorageLog> {
    return this.storageLogsService.createRequest(storageLog)
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @HttpCode(HttpStatus.OK)
  async getStorageLogs(
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("status") status?: string,
    @Query("tag") tag?: string,
    @Query("itemId") itemId?: string
  ): Promise<{ data: StorageLog[]; total: number }> {
    return this.storageLogsService.getStorageLogs(
      page,
      limit,
      startDate,
      endDate,
      status,
      tag,
      itemId
    )
  }

  @UseGuards(JwtAuthGuard)
  @Get("month")
  @HttpCode(HttpStatus.OK)
  async getStorageLogsByMonth(
    @Query("month") month: string,
    @Query("year") year: string
  ): Promise<GetMonthStorageLogsReponse> {
    return this.storageLogsService.getDeliveredLogsByMonth(
      Number(month),
      Number(year)
    )
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getStorageLogById(@Query("id") id: string): Promise<StorageLog | null> {
    return this.storageLogsService.getStorageLogById(id)
  }

  @UseGuards(JwtAuthGuard)
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateStorageLog(
    @Param("id") id: string,
    @Body() storageLog: StorageLogDto
  ): Promise<StorageLog | null> {
    return this.storageLogsService.updateStorageLog(id, storageLog)
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStorageLog(@Param("id") id: string): Promise<void> {
    await this.storageLogsService.deleteStorageLog(id)
  }
}
