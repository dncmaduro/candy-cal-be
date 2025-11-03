import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  Patch,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesFunnelService } from "./salesfunnel.service"
import {
  SalesFunnel,
  SalesFunnelStage
} from "../database/mongoose/schemas/SalesFunnel"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("salesfunnel")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesFunnelController {
  constructor(
    private readonly salesFunnelService: SalesFunnelService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "sales-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createLead(
    @Body()
    body: { name: string; facebook: string; channel: string; user: string },
    @Req() req
  ): Promise<SalesFunnel> {
    const created = await this.salesFunnelService.createLead({
      ...body
    })
    void this.systemLogsService.createSystemLog(
      {
        type: "salesfunnel",
        action: "created",
        entity: "salesfunnel",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/contacted")
  @HttpCode(HttpStatus.OK)
  async moveToContacted(
    @Param("id") id: string,
    @Body() body: { province: string; phoneNumber: string },
    @Req() req
  ): Promise<SalesFunnel> {
    const updated = await this.salesFunnelService.moveToContacted(
      id,
      body,
      req.user.userId
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesfunnel",
        action: "moved_to_contacted",
        entity: "salesfunnel",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/stage")
  @HttpCode(HttpStatus.OK)
  async updateStage(
    @Param("id") id: string,
    @Body() body: { stage: SalesFunnelStage },
    @Req() req
  ): Promise<SalesFunnel> {
    const updated = await this.salesFunnelService.updateStage(
      id,
      body.stage,
      req.user.userId
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesfunnel",
        action: "updated_stage",
        entity: "salesfunnel",
        entityId: updated._id.toString(),
        result: "success",
        meta: { newStage: body.stage }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp")
  @Patch(":id")
  @HttpCode(HttpStatus.OK)
  async updateInfo(
    @Param("id") id: string,
    @Body()
    body: {
      name?: string
      facebook?: string
      province?: string
      phoneNumber?: string
      channel?: string
      hasBuyed?: boolean
    },
    @Req() req
  ): Promise<SalesFunnel> {
    const updated = await this.salesFunnelService.updateInfo(
      id,
      body,
      req.user.userId
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesfunnel",
        action: "updated_info",
        entity: "salesfunnel",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get(":id")
  @HttpCode(HttpStatus.OK)
  async getFunnelById(@Param("id") id: string): Promise<SalesFunnel | null> {
    return this.salesFunnelService.getFunnelById(id)
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async searchFunnels(
    @Query("stage") stage?: SalesFunnelStage,
    @Query("channel") channel?: string,
    @Query("province") province?: string,
    @Query("user") user?: string,
    @Query("searchText") searchText?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: SalesFunnel[]; total: number }> {
    return this.salesFunnelService.searchFunnels(
      { stage, channel, province, user, searchText },
      Number(page),
      Number(limit)
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("/psid/:psid")
  @HttpCode(HttpStatus.OK)
  async getFunnelByPsid(
    @Param("psid") psid: string
  ): Promise<SalesFunnel | null> {
    return this.salesFunnelService.getFunnelByPsid(psid)
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/cost")
  @HttpCode(HttpStatus.OK)
  async updateCost(
    @Param("id") id: string,
    @Body() body: { cost: number },
    @Req() req
  ): Promise<SalesFunnel> {
    const updated = await this.salesFunnelService.updateCost(id, body.cost)
    void this.systemLogsService.createSystemLog(
      {
        type: "salesfunnel",
        action: "updated_cost",
        entity: "salesfunnel",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }
}
