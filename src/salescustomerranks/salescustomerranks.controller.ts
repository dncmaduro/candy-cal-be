import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req
} from "@nestjs/common"
import { SalesCustomerRanksService } from "./salescustomerranks.service"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import {
  SalesCustomerRank,
  Rank
} from "../database/mongoose/schemas/SalesCustomerRank"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("salescustomerranks")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesCustomerRanksController {
  constructor(
    private readonly salesCustomerRanksService: SalesCustomerRanksService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRank(
    @Body()
    body: {
      rank: Rank
      minIncome: number
    },
    @Req() req
  ): Promise<SalesCustomerRank> {
    const created = await this.salesCustomerRanksService.createRank(body)
    void this.systemLogsService.createSystemLog(
      {
        type: "salescustomerranks",
        action: "created",
        entity: "salescustomerrank",
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
  async getAllRanks(): Promise<SalesCustomerRank[]> {
    return this.salesCustomerRanksService.getAllRanks()
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getRankById(
    @Param("id") id: string
  ): Promise<SalesCustomerRank | null> {
    return this.salesCustomerRanksService.getRankById(id)
  }

  @Roles("admin")
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async updateRank(
    @Param("id") id: string,
    @Body()
    body: {
      rank?: Rank
      minIncome?: number
    },
    @Req() req
  ): Promise<SalesCustomerRank> {
    const updated = await this.salesCustomerRanksService.updateRank(id, body)
    void this.systemLogsService.createSystemLog(
      {
        type: "salescustomerranks",
        action: "updated",
        entity: "salescustomerrank",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin")
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRank(@Param("id") id: string, @Req() req): Promise<void> {
    await this.salesCustomerRanksService.deleteRank(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "salescustomerranks",
        action: "deleted",
        entity: "salescustomerrank",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
  }
}
