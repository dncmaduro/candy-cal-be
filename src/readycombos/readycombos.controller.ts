import { UseGuards } from "@nestjs/common"
import { PermissionsGuard } from "../permissions/permissions.guard"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req
} from "@nestjs/common"
import { ReadyCombosService } from "./readycombos.service"
import { Permissions } from "../permissions/permissions.decorator"
import { ReadyComboDto } from "./dto/readycombos.dto"
import { ReadyCombo } from "../database/mongoose/schemas/ReadyCombo"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("readycombos")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReadyCombosController {
  constructor(
    private readonly readyCombosService: ReadyCombosService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Permissions()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCombo(
    @Body() combo: ReadyComboDto,
    @Req() req
  ): Promise<ReadyCombo> {
    const created = await this.readyCombosService.createCombo(combo)
    void this.systemLogsService.createSystemLog(
      {
        type: "combos",
        action: "created",
        entity: "ready_combo",
        entityId: created._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return created
  }

  @Permissions()
  @Put("/:comboId")
  @HttpCode(HttpStatus.OK)
  async updateCombo(
    @Body() combo: ReadyComboDto,
    @Param("comboId") comboId: string,
    @Req() req
  ): Promise<ReadyCombo> {
    const updated = await this.readyCombosService.updateCombo(comboId, combo)
    void this.systemLogsService.createSystemLog(
      {
        type: "combos",
        action: "updated",
        entity: "ready_combo",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Permissions()
  @Patch("/:comboId/toggle")
  @HttpCode(HttpStatus.OK)
  async toggleReadyCombo(
    @Param("comboId") comboId: string,
    @Req() req
  ): Promise<ReadyCombo> {
    const updated = await this.readyCombosService.toggleReadyCombo(comboId)
    void this.systemLogsService.createSystemLog(
      {
        type: "combos",
        action: "toggled",
        entity: "ready_combo",
        entityId: updated._id.toString(),
        result: "success"
      },
      req.user.userId
    )
    return updated
  }

  @Permissions()
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchCombos(
    @Query("searchText") searchText?: string,
    @Query("isReady") isReady?: boolean
  ): Promise<ReadyCombo[]> {
    return this.readyCombosService.searchCombos(searchText, isReady)
  }

  @Permissions()
  @Delete("/:comboId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCombo(
    @Param("comboId") comboId: string,
    @Req() req
  ): Promise<void> {
    await this.readyCombosService.deleteCombo(comboId)
    void this.systemLogsService.createSystemLog(
      {
        type: "combos",
        action: "deleted",
        entity: "ready_combo",
        entityId: comboId,
        result: "success"
      },
      req.user.userId
    )
  }
}
