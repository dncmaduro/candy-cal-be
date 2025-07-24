import {
  Body,
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  Param
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { PackingRulesService } from "./packingrules.service"
import { PackingRule } from "../database/mongoose/schemas/PackingRule"
import { PackingRuleDto } from "./dto/packingrules.dto"

@Controller("packingrules")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackingRulesController {
  constructor(private readonly packingRulesService: PackingRulesService) {}

  @Roles("admin", "accounting-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRule(@Body() dto: PackingRuleDto): Promise<PackingRule> {
    return this.packingRulesService.createRule(dto)
  }

  @Roles("admin", "accounting-emp")
  @Patch(":productCode")
  @HttpCode(HttpStatus.OK)
  async updateRule(
    @Param("productCode") productCode: string,
    @Body() dto: PackingRuleDto
  ): Promise<PackingRule> {
    return this.packingRulesService.updateRule(productCode, dto)
  }

  @Roles("admin", "accounting-emp")
  @Delete(":productCode")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(@Param("productCode") productCode: string): Promise<void> {
    await this.packingRulesService.deleteRule(productCode)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get(":productCode")
  @HttpCode(HttpStatus.OK)
  async getRuleByProductCode(
    @Param("productCode") productCode: string
  ): Promise<PackingRule | null> {
    return this.packingRulesService.getRuleByProductCode(productCode)
  }

  @Roles("admin", "order-emp", "accounting-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async searchRules(
    @Query("searchText") searchText: string,
    @Query("packingType") packingType?: string
  ): Promise<PackingRule[]> {
    return this.packingRulesService.searchRules(searchText, packingType)
  }
}
