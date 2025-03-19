import { Combo } from "src/database/mongoose/schemas/Combo";
import { ComboDto } from "./dto/combo.dto";
export interface ICombosService {
    createCombo(combo: ComboDto): Promise<Combo>;
    updateCombo(combo: Combo): Promise<Combo>;
    updateProductsForCombo(comboId: string, products: Combo["products"]): Promise<Combo>;
    getAllCombos(): Promise<Combo[]>;
    getCombo(id: string): Promise<Combo>;
    searchCombos(searchText: string): Promise<Combo[]>;
}
