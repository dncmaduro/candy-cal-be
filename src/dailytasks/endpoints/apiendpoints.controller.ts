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
import { RolesGuard } from "../../roles/roles.guard"
import { Roles } from "../../roles/roles.decorator"
import { ApiEndpointsService } from "./apiendpoints.service"

@Controller("api-endpoints")
@UseGuards(JwtAuthGuard, RolesGuard)
export class ApiEndpointsController {
  constructor(private readonly apiEndpointsService: ApiEndpointsService) {}

  @Roles("admin")
  @Get()
  @HttpCode(HttpStatus.OK)
  async list(): Promise<{ data: any[] }> {
    const data = await this.apiEndpointsService.list()
    return { data }
  }

  @Roles("admin")
  @Get("options")
  @HttpCode(HttpStatus.OK)
  async options(): Promise<{ data: Array<{ value: string; label: string }> }> {
    const data = await this.apiEndpointsService.options()
    return { data }
  }

  @Roles("admin")
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

  @Roles("admin")
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

  @Roles("admin")
  @Patch(":key/delete")
  @HttpCode(HttpStatus.OK)
  async delete(@Param("key") key: string): Promise<{ deleted: boolean }> {
    return this.apiEndpointsService.softDelete(key)
  }
}
