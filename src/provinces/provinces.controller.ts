import { UseGuards } from "@nestjs/common"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { Controller, Post, Get, HttpCode, HttpStatus } from "@nestjs/common"
import { ProvincesService } from "./provinces.service"
import { Permissions } from "../permissions/permissions.decorator"

@Controller("provinces")
// @UseGuards(JwtAuthGuard)
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  // @Permissions()
  @Post("/sync")
  @HttpCode(HttpStatus.OK)
  async syncProvinces(): Promise<{ synced: number }> {
    const synced = await this.provincesService.syncProvincesFromPublicSource()
    return { synced }
  }

  // @Permissions()
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAll() {
    return this.provincesService.getAllProvinces()
  }
}
