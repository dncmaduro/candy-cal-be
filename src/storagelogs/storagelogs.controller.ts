import {
  BadRequestException,
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
import { differenceInCalendarDays } from "date-fns"

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
    @Body() storageLog: StorageLogDto, // Expects { items: [...], status, date, note?, tag?, deliveredRequestId? }
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
    @Query("itemId") itemId?: string // Works with both old and new format
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
  async getDeliveredLogsByMonth(
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
  @Get("delivered/summary")
  @HttpCode(HttpStatus.OK)
  async getDeliveredSummary(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ): Promise<{
    startDate: string
    endDate: string
    totalDeliveredQuantity: number
    days: number
    averagePerDay: number
    items: Array<{
      itemId: string
      totalDeliveredQuantity: number
      averagePerDay: number
      item?: { _id: string; code: string; name: string; quantityPerBox: number }
    }>
  }> {
    if (!startDate || !endDate) {
      throw new BadRequestException("startDate and endDate are required")
    }

    const start = new Date(startDate)
    const end = new Date(endDate)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException("startDate/endDate must be valid dates")
    }
    if (start.getTime() > end.getTime()) {
      throw new BadRequestException("startDate must be <= endDate")
    }

    const days = differenceInCalendarDays(end, start) + 1
    const summary =
      await this.storageLogsService.getDeliveredQuantitySummaryByDateRange(
        start,
        end
      )
    const totalDeliveredQuantity = summary.totalQuantity
    const averagePerDay = days > 0 ? totalDeliveredQuantity / days : 0

    return {
      startDate,
      endDate,
      totalDeliveredQuantity,
      days,
      averagePerDay,
      items: summary.byItem.map((row) => ({
        itemId: row.itemId,
        totalDeliveredQuantity: row.totalQuantity,
        averagePerDay: days > 0 ? row.totalQuantity / days : 0,
        item: row.item
      }))
    }
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
    @Body() storageLog: StorageLogDto, // Will convert old format to new format automatically
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
