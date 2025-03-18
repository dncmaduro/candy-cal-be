import { ItemsService } from "./items.service";
import { ItemDto } from "./dto/item.dto";
import { Item } from "src/database/mongoose/schemas/Item";
export declare class ItemsController {
    private readonly itemsService;
    constructor(itemsService: ItemsService);
    createItem(item: ItemDto): Promise<Item>;
    updateItem(item: Item): Promise<Item>;
    getAllItems(): Promise<Item[]>;
    getItem(id: string): Promise<Item>;
    searchItems(searchText: string): Promise<Item[]>;
}
