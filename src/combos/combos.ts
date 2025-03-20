import { Combo } from "src/database/mongoose/schemas/Combo"
import { CalComboDto, ComboDto } from "./dto/combo.dto"

export interface CalItemsResponse {
  _id: string
  quantity: number
}

export interface ICombosService {
  createCombo(combo: ComboDto): Promise<Combo>
  updateCombo(combo: Combo): Promise<Combo>
  updateProductsForCombo(
    comboId: string,
    products: Combo["products"]
  ): Promise<Combo>
  getAllCombos(): Promise<Combo[]>
  getCombo(id: string): Promise<Combo>
  searchCombos(searchText: string): Promise<Combo[]>
  calToItems(combos: CalComboDto[]): Promise<CalItemsResponse[]>
}
