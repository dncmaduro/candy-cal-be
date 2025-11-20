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
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Res
} from "@nestjs/common"
import { Response } from "express"
import { FileInterceptor } from "@nestjs/platform-express"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesFunnelService } from "./salesfunnel.service"
import {
  SalesFunnel,
  SalesFunnelStage
} from "../database/mongoose/schemas/SalesFunnel"
import { Rank } from "../database/mongoose/schemas/SalesCustomerRank"
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
    body: { name: string; channel: string },
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
  @Post("upload")
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor("file", {
      limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB
      }
    })
  )
  async uploadFunnels(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<{
    success: true
    inserted: number
    skipped: number
    warnings?: string[]
    totalWarnings?: number
  }> {
    const result = await this.salesFunnelService.uploadFunnels(file)

    void this.systemLogsService.createSystemLog(
      {
        type: "salesfunnel",
        action: "upload",
        entity: "salesfunnel",
        result: "success",
        meta: {
          fileSize: file?.size,
          inserted: result.inserted,
          skipped: result.skipped
        }
      },
      req.user.userId
    )

    return result
  }

  @Roles("admin", "sales-emp")
  @Get("upload/template")
  @HttpCode(HttpStatus.OK)
  async downloadUploadTemplate(@Res() res: Response): Promise<void> {
    const buffer = await this.salesFunnelService.generateUploadTemplate()

    const filename = `funnel_upload_template_${new Date().getTime()}.xlsx`
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`)
    res.send(buffer)
  }

  @Roles("admin", "sales-emp")
  @Patch(":id/contacted")
  @HttpCode(HttpStatus.OK)
  async moveToContacted(
    @Param("id") id: string,
    @Body() body: { province?: string; phoneNumber?: string },
    @Req() req
  ): Promise<SalesFunnel> {
    const isAdmin = req.user.roles?.includes("admin") || false
    const updated = await this.salesFunnelService.moveToContacted(
      id,
      body,
      req.user.userId,
      isAdmin
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
    const isAdmin = req.user.roles?.includes("admin") || false
    const updated = await this.salesFunnelService.updateStage(
      id,
      body.stage,
      req.user.userId,
      isAdmin
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
      province?: string
      phoneNumber?: string
      secondaryPhoneNumbers?: string[]
      address?: string
      channel?: string
      hasBuyed?: boolean
    },
    @Req() req
  ): Promise<SalesFunnel> {
    const isAdmin = req.user.roles?.includes("admin") || false
    const updated = await this.salesFunnelService.updateInfo(
      id,
      body,
      req.user.userId,
      isAdmin
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
  async getFunnelById(@Param("id") id: string): Promise<any> {
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
    @Query("rank") rank?: Rank,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("noActivityDays") noActivityDays?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ data: any[]; total: number }> {
    return this.salesFunnelService.searchFunnels(
      {
        stage,
        channel,
        province,
        user,
        searchText,
        rank,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
        noActivityDays: noActivityDays ? Number(noActivityDays) : undefined
      },
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

  @Roles("admin", "sales-emp")
  @Patch(":id/user")
  @HttpCode(HttpStatus.OK)
  async updateResponsibleUser(
    @Param("id") id: string,
    @Body() body: { userId: string },
    @Req() req
  ): Promise<SalesFunnel> {
    const isAdmin = req.user.roles?.includes("admin") || false
    const updated = await this.salesFunnelService.updateResponsibleUser(
      id,
      body.userId,
      req.user.userId,
      isAdmin
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "salesfunnel",
        action: "updated_responsible_user",
        entity: "salesfunnel",
        entityId: updated._id.toString(),
        result: "success",
        meta: { newUserId: body.userId }
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get(":id/check-permission")
  @HttpCode(HttpStatus.OK)
  async checkFunnelPermission(
    @Param("id") id: string,
    @Req() req
  ): Promise<{
    hasPermission: boolean
    isAdmin: boolean
    isResponsible: boolean
  }> {
    const isAdmin = req.user.roles?.includes("admin") || false
    return this.salesFunnelService.checkFunnelPermission(
      id,
      req.user.userId,
      isAdmin
    )
  }

  @Roles("admin", "sales-emp", "system-emp")
  @Get("user/:userId")
  @HttpCode(HttpStatus.OK)
  async getFunnelsByUser(
    @Param("userId") userId: string,
    @Query("limit") limit: string = "20"
  ): Promise<{ data: SalesFunnel[] }> {
    const data = await this.salesFunnelService.getFunnelsByUser(
      userId,
      Number(limit)
    )
    return { data }
  }
}
