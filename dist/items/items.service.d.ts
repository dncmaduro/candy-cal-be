import { IItemsService } from "./items";
import { Model } from "mongoose";
import { Item } from "src/database/mongoose/schemas/Item";
import { ItemDto } from "./dto/item.dto";
export declare class ItemsService implements IItemsService {
    private readonly itemModel;
    constructor(itemModel: Model<Item>);
    createItem(item: ItemDto): Promise<Item>;
    updateItem(item: Item): Promise<Item>;
    getAllItems(): Promise<Item[]>;
    getItem(id: string): Promise<Item>;
    searchItems(searchText: string): Promise<Item[]>;
}
