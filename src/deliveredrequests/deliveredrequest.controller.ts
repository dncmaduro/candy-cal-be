import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { DeliveredRequestsService } from "./deliveredrequests.service"
import { Roles } from "../roles/roles.decorator"
import { DeliveredRequestDto } from "./dto/deliveredrequests.dto"
import { DeliveredRequest } from "../database/mongoose/schemas/DeliveredRequest"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("deliveredrequests")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveredRequestsController {
  constructor(
    private readonly deliveredRequestsService: DeliveredRequestsService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDeliveredRequest(
    @Body() request: DeliveredRequestDto,
    @Req() req
  ): Promise<DeliveredRequest> {
    const created = await this.deliveredRequestsService.createRequest(request)
    void this.systemLogsService.createSystemLog(
      {
        type: "delivered",
        action: "request_created",
        entity: "delivered_request",
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Post(":id/comment")
  @HttpCode(HttpStatus.OK)
  async addComment(
    @Param("id") requestId: string,
    @Body()
    comment: { userId: string; name: string; text: string; date: Date },
    @Req() req
  ): Promise<DeliveredRequest> {
    const res = await this.deliveredRequestsService.addComment(
      requestId,
      comment
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "delivered",
        action: "comment_added",
        entity: "delivered_request",
        entityId: requestId,
        result: "success"
      },
      req.user.userId
    )
    return res
  }

  @Roles("admin", "accounting-emp")
  @Patch(":id/accept")
  @HttpCode(HttpStatus.OK)
  async acceptRequest(
    @Param("id") id: string,
    @Req() req
  ): Promise<DeliveredRequest> {
    const res = await this.deliveredRequestsService.acceptRequest(id)
    void this.systemLogsService.createSystemLog(
      {
        type: "delivered",
        action: "accepted",
        entity: "delivered_request",
        entityId: id,
        result: "success"
      },
      req.user.userId
    )
    return res
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("search")
  @HttpCode(HttpStatus.OK)
  async searchRequests(
    @Req() req,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ requests: DeliveredRequest[]; total: number }> {
    const res = await this.deliveredRequestsService.searchRequests(
      startDate,
      endDate,
      page,
      limit
    )
    void this.systemLogsService.createSystemLog(
      {
        type: "delivered",
        action: "search",
        entity: "delivered_request",
        result: "success",
        meta: { startDate, endDate, page, limit }
      },
      req.user.userId
    )
    return res
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get(":requestId")
  @HttpCode(HttpStatus.OK)
  async getRequest(
    @Param("requestId") requestId: string
  ): Promise<DeliveredRequest> {
    return this.deliveredRequestsService.getRequest(requestId)
  }

  @Roles("admin", "accounting-emp")
  @Patch(":requestId/undo-request")
  @HttpCode(HttpStatus.OK)
  async undoAcceptRequest(
    @Param("requestId") requestId: string,
    @Req() req
  ): Promise<DeliveredRequest> {
    const res = await this.deliveredRequestsService.undoAcceptRequest(requestId)
    void this.systemLogsService.createSystemLog(
      {
        type: "delivered",
        action: "undo_accept",
        entity: "delivered_request",
        entityId: requestId,
        result: "success"
      },
      req.user.userId
    )
    return res
  }
}
