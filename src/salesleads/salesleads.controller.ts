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
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { SalesLeadsService } from "./salesleads.service"

@Controller("sales-leads")
@UseGuards(JwtAuthGuard, RolesGuard)
export class SalesLeadsController {
  constructor(private readonly service: SalesLeadsService) {}
  @Get("available-cs")
  @Roles("sales-hunter", "sales-cs", "sales-leader", "admin")
  available(@Query("channelId") channelId?: string) {
    return this.service.availableCs(channelId)
  }
  @Post() @Roles("sales-hunter", "sales-leader", "admin") create(
    @Body() body: any,
    @Req() req: any
  ) {
    return this.service.create(body, req.user.userId)
  }
  @Get("pool")
  @Roles("sales-hunter", "sales-leader", "admin")
  pool() {
    return this.service.pool()
  }
  @Post(":id/assign")
  @Roles("sales-hunter", "sales-leader", "admin")
  assign(
    @Param("id") id: string,
    @Body() body: { salesCsId?: string; channelId?: string },
    @Req() req: any
  ) {
    return this.service.assignPooled(
      id,
      body.salesCsId,
      req.user.userId,
      req.user.roles,
      body.channelId
    )
  }
  @Get("mine/acquired")
  @Roles("sales-hunter", "sales-leader", "admin")
  acquired(@Req() req: any) {
    return this.service.acquired(req.user.userId, req.user.roles)
  }
  @Get("mine/active")
  @Roles("sales-hunter", "sales-cs", "sales-leader", "admin")
  active(@Req() req: any, @Query("needsCall") needsCall?: string) {
    return this.service.active(
      req.user.userId,
      req.user.roles,
      needsCall === "true"
    )
  }
  @Get("availability")
  @Roles("sales-hunter", "sales-leader", "admin")
  availability() {
    return this.service.availability()
  }
  @Patch("availability/:userId")
  @Roles("sales-hunter", "sales-leader", "admin")
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
  @Roles("sales-hunter", "sales-leader", "admin")
  callCompliance(@Query("cycleKey") cycleKey?: string) {
    return this.service.callCompliance(cycleKey)
  }
  @Get(":id/calls")
  @Roles("sales-cs", "sales-leader", "admin")
  calls(@Param("id") id: string, @Req() req: any) {
    return this.service.callsFor(id, req.user.userId, req.user.roles)
  }
  @Get("by-funnel/:funnelId")
  @Roles("sales-hunter", "sales-cs", "sales-leader", "admin")
  detailByFunnel(@Param("funnelId") funnelId: string, @Req() req: any) {
    return this.service.detailByFunnel(
      funnelId,
      req.user.userId,
      req.user.roles
    )
  }
  @Get(":id")
  @Roles("sales-hunter", "sales-cs", "sales-leader", "admin")
  detail(@Param("id") id: string, @Req() req: any) {
    return this.service.detail(id, req.user.userId, req.user.roles)
  }
  @Post(":id/calls") @Roles("sales-cs", "sales-leader", "admin") call(
    @Param("id") id: string,
    @Body() body: any,
    @Req() req: any
  ) {
    return this.service.addCall(id, body, req.user.userId, req.user.roles)
  }
  @Post(":id/transfer") @Roles("sales-cs", "sales-leader", "admin") transfer(
    @Param("id") id: string,
    @Body("salesCsId") salesCsId: string,
    @Req() req: any
  ) {
    return this.service.transfer(id, salesCsId, req.user.userId, req.user.roles)
  }
}
