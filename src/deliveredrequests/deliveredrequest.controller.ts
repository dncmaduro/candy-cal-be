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
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { DeliveredRequestsService } from "./deliveredrequests.service"
import { Roles } from "../roles/roles.decorator"
import { DeliveredRequestDto } from "./dto/deliveredrequests.dto"
import { DeliveredRequest } from "../database/mongoose/schemas/DeliveredRequest"

@Controller("deliveredrequests")
@UseGuards(JwtAuthGuard, RolesGuard)
export class DeliveredRequestsController {
  constructor(
    private readonly deliveredRequestsService: DeliveredRequestsService
  ) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createDeliveredRequest(
    @Body() request: DeliveredRequestDto
  ): Promise<DeliveredRequest> {
    return this.deliveredRequestsService.createRequest(request)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Post(":id/comment")
  @HttpCode(HttpStatus.OK)
  async addComment(
    @Param() requestId: string,
    @Body()
    comment: { userId: string; name: string; text: string; date: Date }
  ): Promise<DeliveredRequest> {
    return this.deliveredRequestsService.addComment(requestId, comment)
  }

  @Roles("admin", "accounting-emp")
  @Patch(":id/accept")
  @HttpCode(HttpStatus.OK)
  async acceptRequest(@Param("id") id: string): Promise<DeliveredRequest> {
    return this.deliveredRequestsService.acceptRequest(id)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get("search")
  @HttpCode(HttpStatus.OK)
  async searchRequests(
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10
  ): Promise<{ requests: DeliveredRequest[]; total: number }> {
    return this.deliveredRequestsService.searchRequests(
      startDate,
      endDate,
      page,
      limit
    )
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
    @Param("requestId") requestId: string
  ): Promise<DeliveredRequest> {
    return this.deliveredRequestsService.undoAcceptRequest(requestId)
  }
}
