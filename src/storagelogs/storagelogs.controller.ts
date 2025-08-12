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
  UseGuards,
  Req
} from "@nestjs/common"
import { StorageLogsService } from "./storagelogs.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { StorageLogDto } from "./dto/storagelog.dto"
import { StorageLog } from "../database/mongoose/schemas/StorageLog"
import { GetMonthStorageLogsReponse } from "./dto/month"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("storagelogs")
@UseGuards(JwtAuthGuard, RolesGuard)
export class StorageLogsController {
  constructor(
    private readonly storageLogsService: StorageLogsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "accounting-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createStorageLog(
    @Body() storageLog: StorageLogDto,
    @Req() req
  ): Promise<StorageLog> {
    const created = await this.storageLogsService.createRequest(storageLog)
    void this.systemLogsService.createSystemLog(
      {
        type: "storagelogs",
        action: "created",
        entity: "storage_log",
        entityId: created._id.toString(),
        result: "success",
        meta: { tag: created.tag, status: created.status }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "accounting-emp", "system-emp")
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

  @Roles("admin", "accounting-emp", "system-emp")
  @Get("month")
  @HttpCode(HttpStatus.OK)
  async getStorageLogsByMonth(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("tag") tag?: string
  ): Promise<GetMonthStorageLogsReponse> {
    return this.storageLogsService.getDeliveredLogsByMonth(
      Number(month),
      Number(year),
      tag
    )
  }

  @Roles("admin", "accounting-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getStorageLogById(@Param("id") id: string): Promise<StorageLog | null> {
    return this.storageLogsService.getStorageLogById(id)
  }

  @Roles("admin", "accounting-emp")
  @Put(":id")
  @HttpCode(HttpStatus.OK)
  async updateStorageLog(
    @Param("id") id: string,
    @Body() storageLog: StorageLogDto,
    @Req() req
  ): Promise<StorageLog | null> {
    const updated = await this.storageLogsService.updateStorageLog(
      id,
      storageLog
    )
    if (updated) {
      void this.systemLogsService.createSystemLog(
        {
          type: "storagelogs",
          action: "updated",
          entity: "storage_log",
          entityId: updated._id.toString(),
          result: "success",
          meta: { tag: updated.tag, status: updated.status }
        },
        req.user.userId
      )
    }
    return updated
  }

  @Roles("admin", "accounting-emp")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStorageLog(@Param("id") id: string, @Req() req): Promise<void> {
    await this.storageLogsService.deleteStorageLog(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "storagelogs",
        action: "deleted",
        entity: "storage_log",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
