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
  Query
} from "@nestjs/common"
import { ReadyCombosService } from "./readycombos.service"
import { Roles } from "../roles/roles.decorator"
import { ReadyComboDto } from "./dto/readycombos.dto"
import { ReadyCombo } from "../database/mongoose/schemas/ReadyCombo"

@Controller("readycombos")
export class ReadyCombosController {
  constructor(private readonly readyCombosService: ReadyCombosService) {}

  @Roles("admin", "order-emp")
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCombo(@Body() combo: ReadyComboDto): Promise<ReadyCombo> {
    return this.readyCombosService.createCombo(combo)
  }

  @Roles("admin", "order-emp")
  @Put("/:comboId")
  @HttpCode(HttpStatus.OK)
  async updateCombo(
    @Body() combo: ReadyComboDto,
    @Param("comboId") comboId: string
  ): Promise<ReadyCombo> {
    return this.readyCombosService.updateCombo(comboId, combo)
  }

  @Roles("admin", "order-emp")
  @Patch("/:comboId/toggle")
  @HttpCode(HttpStatus.OK)
  async toggleReadyCombo(
    @Param("comboId") comboId: string
  ): Promise<ReadyCombo> {
    return this.readyCombosService.toggleReadyCombo(comboId)
  }

  @Roles("admin", "order-emp", "accounting-emp")
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
  async deleteCombo(@Param("comboId") comboId: string): Promise<void> {
    return this.readyCombosService.deleteCombo(comboId)
  }
}
