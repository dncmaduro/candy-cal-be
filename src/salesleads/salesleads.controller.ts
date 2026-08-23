import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { SalesLeadsService } from "./salesleads.service"

@Controller("sales-leads")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalesLeadsController {
  constructor(private readonly service: SalesLeadsService) {}
  @Get("available-cs")
  @Permissions()
  available(@Query("channelId") channelId?: string) {
    return this.service.availableCs(channelId)
  }
  @Post() @Permissions() create(
    @Body() body: any,
    @Req() req: any
  ) {
    return this.service.create(body, req.user.userId)
  }
  @Get("pool")
  @Permissions()
  pool() {
    return this.service.pool()
  }
  @Post(":id/assign")
  @Permissions()
  assign(
    @Param("id") id: string,
    @Body() body: { salesCsId?: string; channelId?: string },
    @Req() req: any
  ) {
    return this.service.assignPooled(
      id,
      body.salesCsId,
      req.user.userId,
      body.channelId
    )
  }
  @Get("mine/acquired")
  @Permissions()
  acquired(@Req() req: any) {
    return this.service.acquired()
  }
  @Get("mine/active")
  @Permissions()
  active(@Req() req: any, @Query("needsCall") needsCall?: string) {
    return this.service.active(
      req.user.userId,
      req.user.permissions,
      needsCall === "true"
    )
  }
  @Get("availability")
  @Permissions()
  availability() {
    return this.service.availability()
  }
  @Patch("availability/:userId")
  @Permissions()
  setAvailability(
    @Param("userId") userId: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.service.setAvailability(
      userId,
      body.isReceivingLeads,
      req.user.userId,
      body.note
    )
  }
  @Get("reports/call-compliance")
  @Permissions()
  callCompliance(@Query("cycleKey") cycleKey?: string) {
    return this.service.callCompliance(cycleKey)
  }
  @Get(":id/calls")
  @Permissions()
  calls(@Param("id") id: string, @Req() req: any) {
    return this.service.callsFor(id, req.user.userId, req.user.permissions)
  }
  @Get("by-funnel/:funnelId")
  @Permissions()
  detailByFunnel(@Param("funnelId") funnelId: string, @Req() req: any) {
    return this.service.detailByFunnel(
      funnelId,
      req.user.userId,
      req.user.permissions
    )
  }
  @Get(":id")
  @Permissions()
  detail(@Param("id") id: string, @Req() req: any) {
    return this.service.detail(id, req.user.userId, req.user.permissions)
  }
  @Post(":id/calls") @Permissions() call(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.service.addCall(id, body, req.user.userId, req.user.permissions)
  }
  @Post(":id/transfer") @Permissions() transfer(
    @Param("id") id: string,
    @Body("salesCsId") salesCsId: string,
    @Req() req: any
  ) {
    return this.service.transfer(id, salesCsId, req.user.userId, req.user.permissions)
  }
}
