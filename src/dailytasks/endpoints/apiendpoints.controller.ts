import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../../auth/jwt-auth.guard"
import { PermissionsGuard } from "../../permissions/permissions.guard"
import { Permissions } from "../../permissions/permissions.decorator"
import { ApiEndpointsService } from "./apiendpoints.service"
import { ApiEndpointAutoDiscoverService } from "./apiendpoints.autodiscover"

@Controller("api-endpoints")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApiEndpointsController {
  constructor(
    private readonly apiEndpointsService: ApiEndpointsService,
    private readonly autoDiscoverService: ApiEndpointAutoDiscoverService
  ) {}

  @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(): Promise<{ data: any[] }> {
    const data = await this.apiEndpointsService.list()
    return { data }
  }

  @Permissions()
  @Get("options")
  @HttpCode(HttpStatus.OK)
  async options(): Promise<{ data: Array<{ value: string; label: string }> }> {
    const data = await this.apiEndpointsService.options()
    return { data }
  }

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body()
    body: {
      key: string
      name: string
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
      url: string
      headers?: Record<string, string>
      description?: string
    }
  ): Promise<{ data: any }> {
    const doc = await this.apiEndpointsService.create(body)
    return { data: doc }
  }

  @Permissions()
  @Patch(":key")
  @HttpCode(HttpStatus.OK)
  async update(
    @Param("key") key: string,
    @Body()
    body: Partial<{
      name: string
      method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"
      url: string
      headers: Record<string, string>
      description: string
      active: boolean
    }>
  ): Promise<{ data: any }> {
    const doc = await this.apiEndpointsService.update(key, body)
    return { data: doc }
  }

  @Permissions()
  @Patch(":key/delete")
  @HttpCode(HttpStatus.OK)
  async delete(@Param("key") key: string): Promise<{ deleted: boolean }> {
    return this.apiEndpointsService.softDelete(key)
  }

  @Permissions()
  @Post("discover")
  @HttpCode(HttpStatus.OK)
  async triggerDiscovery(): Promise<{ message: string }> {
    // Chạy discovery ngay lập tức (manual trigger)
    this.autoDiscoverService.runDiscoveryNow().catch((error) => {
      console.error("Manual discovery failed:", error)
    })
    return { message: "API endpoints discovery triggered successfully" }
  }
}
