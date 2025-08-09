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
  Param,
  Req
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { PackingRulesService } from "./packingrules.service"
import { PackingRule } from "../database/mongoose/schemas/PackingRule"
import { PackingRuleDto } from "./dto/packingrules.dto"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("packingrules")
@UseGuards(JwtAuthGuard, RolesGuard)
export class PackingRulesController {
  constructor(
    private readonly packingRulesService: PackingRulesService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "accounting-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createRule(
    @Body() dto: PackingRuleDto,
    @Req() req
  ): Promise<PackingRule> {
    const created = await this.packingRulesService.createRule(dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "packingrules",
        action: "created",
        entity: "packing_rule",
        entityId: created._id.toString(),
        result: "success",
        meta: { productCode: created.productCode }
      },
      req.user.userId
    )
    return created
  }

  @Roles("admin", "accounting-emp")
  @Patch(":productCode")
  @HttpCode(HttpStatus.OK)
  async updateRule(
    @Param("productCode") productCode: string,
    @Body() dto: Omit<PackingRuleDto, "productCode">,
    @Req() req
  ): Promise<PackingRule> {
    const updated = await this.packingRulesService.updateRule(productCode, dto)
    void this.systemLogsService.createSystemLog(
      {
        type: "packingrules",
        action: "updated",
        entity: "packing_rule",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Roles("admin", "accounting-emp")
  @Delete(":productCode")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRule(
    @Param("productCode") productCode: string,
    @Req() req
  ): Promise<void> {
    await this.packingRulesService.deleteRule(productCode)
    void this.systemLogsService.createSystemLog(
      {
        type: "packingrules",
        action: "deleted",
        entity: "packing_rule",
        entityId: productCode,
        result: "success"
      },
      req.user.userId
    )
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
  ): Promise<{ rules: PackingRule[] }> {
    return this.packingRulesService.searchRules(searchText, packingType)
  }
}
