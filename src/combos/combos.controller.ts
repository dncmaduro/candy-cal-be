import {
  Controller,
  Post,
  Put,
  Get,
  Body,
  HttpCode,
  HttpStatus,
  Query
} from "@nestjs/common"
import { CombosService } from "./combos.service"
import { CalComboDto, ComboDto } from "./dto/combo.dto"
import { Combo } from "src/database/mongoose/schemas/Combo"
import { CalItemsResponse } from "./combos"

@Controller("combos")
export class CombosController {
  constructor(private readonly combosService: CombosService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createCombo(@Body() combo: ComboDto): Promise<Combo> {
    return this.combosService.createCombo(combo)
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  async updateCombo(@Body() combo: Combo): Promise<Combo> {
    return this.combosService.updateCombo(combo)
  }

  @Put("/products")
  @HttpCode(HttpStatus.OK)
  async updateProductsForCombo(
    @Query("comboId") comboId: string,
    @Body("products") products: Combo["products"]
  ): Promise<Combo> {
    return this.combosService.updateProductsForCombo(comboId, products)
  }

  @Get()
  @HttpCode(HttpStatus.OK)
  async getAllCombos(): Promise<Combo[]> {
    return this.combosService.getAllCombos()
  }

  @Get("/combo")
  @HttpCode(HttpStatus.OK)
  async getCombo(@Query("id") id: string): Promise<Combo> {
    return this.combosService.getCombo(id)
  }

  @Get("/search")
  @HttpCode(HttpStatus.OK)
  async searchCombos(
    @Query("searchText") searchText: string
  ): Promise<Combo[]> {
    return this.combosService.searchCombos(searchText)
  }

  @Post("/cal")
  @HttpCode(HttpStatus.OK)
  async calToItems(@Body() combos: CalComboDto[]): Promise<CalItemsResponse[]> {
    return this.combosService.calToItems(combos)
  }
}
