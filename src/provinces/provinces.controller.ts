import { Controller, Post, Get, HttpCode, HttpStatus } from "@nestjs/common"
import { ProvincesService } from "./provinces.service"
import { Roles } from "../roles/roles.decorator"

@Controller("provinces")
export class ProvincesController {
  constructor(private readonly provincesService: ProvincesService) {}

  @Roles("admin", "system-emp")
  @Post("/sync")
  @HttpCode(HttpStatus.OK)
  async syncProvinces(): Promise<{ synced: number }> {
    const synced = await this.provincesService.syncProvincesFromPublicSource()
    return { synced }
  }

  @Roles("admin", "system-emp", "order-emp", "accounting-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getAll() {
    return this.provincesService.getAllProvinces()
  }
}
