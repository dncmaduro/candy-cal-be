import { ICombosService } from "./combos";
import { Model } from "mongoose";
import { Combo } from "src/database/mongoose/schemas/Combo";
import { ComboDto } from "./dto/combo.dto";
export declare class CombosService implements ICombosService {
    private readonly comboModel;
    constructor(comboModel: Model<Combo>);
    createCombo(combo: ComboDto): Promise<Combo>;
    updateCombo(combo: Combo): Promise<Combo>;
    updateProductsForCombo(comboId: string, products: Combo["products"]): Promise<Combo>;
    getAllCombos(): Promise<Combo[]>;
    getCombo(id: string): Promise<Combo>;
    searchCombos(searchText: string): Promise<Combo[]>;
}
