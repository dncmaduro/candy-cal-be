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
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { LivestreamsalaryService } from "./livestreamsalary.service"

@Controller("livestreamsalary")
@UseGuards(JwtAuthGuard, RolesGuard)
export class LivestreamsalaryController {
  constructor(
    private readonly livestreamsalaryService: LivestreamsalaryService
  ) {}

  @Post()
  @Roles("admin")
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
  @Roles("admin")
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
  @Roles("admin", "livestream-accounting")
  @HttpCode(HttpStatus.OK)
  async searchSalaries(
    @Query("page") page?: number,
    @Query("limit") limit?: number
  ) {
    return this.livestreamsalaryService.searchSalaries(page, limit)
  }

  @Get(":id")
  @Roles("admin")
  @HttpCode(HttpStatus.OK)
  async getSalaryById(@Param("id") id: string) {
    return this.livestreamsalaryService.getSalaryById(id)
  }

  @Delete(":id")
  @Roles("admin")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSalary(@Param("id") id: string) {
    await this.livestreamsalaryService.deleteSalary(id)
  }
}
