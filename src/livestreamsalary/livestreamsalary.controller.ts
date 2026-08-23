import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { Permissions } from "../permissions/permissions.decorator"
import { LivestreamsalaryService } from "./livestreamsalary.service"

@Controller("livestreamsalary")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LivestreamsalaryController {
  constructor(
    private readonly livestreamsalaryService: LivestreamsalaryService
  ) {}

  @Post()
  @Permissions()
  @HttpCode(HttpStatus.CREATED)
  async createSalary(
    @Body()
    payload: {
      name: string
      livestreamPerformances: string[]
      livestreamEmployees: string[]
    }
  ) {
    return this.livestreamsalaryService.createSalary(payload)
  }

  @Put(":id")
  @Permissions()
  @HttpCode(HttpStatus.OK)
  async updateSalary(
    @Param("id") id: string,
    @Body()
    payload: {
      name?: string
      livestreamPerformances?: string[]
      livestreamEmployees?: string[]
    }
  ) {
    return this.livestreamsalaryService.updateSalary(id, payload)
  }

  @Get("search")
  @Permissions()
  @HttpCode(HttpStatus.OK)
  async searchSalaries(
    @Query("page") page?: number,
    @Query("limit") limit?: number
  ) {
    return this.livestreamsalaryService.searchSalaries(page, limit)
  }

  @Get(":id")
  @Permissions()
  @HttpCode(HttpStatus.OK)
  async getSalaryById(@Param("id") id: string) {
    return this.livestreamsalaryService.getSalaryById(id)
  }

  @Delete(":id")
  @Permissions()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSalary(@Param("id") id: string) {
    await this.livestreamsalaryService.deleteSalary(id)
  }
}
