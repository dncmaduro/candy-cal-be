import { CombosService } from "./combos.service";
import { ComboDto } from "./dto/combo.dto";
import { Combo } from "src/database/mongoose/schemas/Combo";
export declare class CombosController {
    private readonly combosService;
    constructor(combosService: CombosService);
    createCombo(combo: ComboDto): Promise<Combo>;
    updateCombo(combo: Combo): Promise<Combo>;
    updateProductsForCombo(comboId: string, products: Combo["products"]): Promise<Combo>;
    getAllCombos(): Promise<Combo[]>;
    getCombo(id: string): Promise<Combo>;
    searchCombos(searchText: string): Promise<Combo[]>;
}
