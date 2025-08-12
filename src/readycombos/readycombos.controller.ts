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
import { Roles } from "../roles/roles.decorator"
import { ReadyComboDto } from "./dto/readycombos.dto"
import { ReadyCombo } from "../database/mongoose/schemas/ReadyCombo"
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Controller("readycombos")
export class ReadyCombosController {
  constructor(
    private readonly readyCombosService: ReadyCombosService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  @Roles("admin", "order-emp")
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

  @Roles("admin", "order-emp")
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

  @Roles("admin", "order-emp")
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

  @Roles("admin", "order-emp", "accounting-emp", "system-emp")
  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchCombos(
    @Query("searchText") searchText?: string,
    @Query("isReady") isReady?: boolean
  ): Promise<ReadyCombo[]> {
    return this.readyCombosService.searchCombos(searchText, isReady)
  }

  @Roles("admin", "order-emp", "accounting-emp")
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
