import { Item } from "src/database/mongoose/schemas/Item"
import { ItemDto } from "./dto/item.dto"

export interface IItemsService {
  createItem(item: ItemDto): Promise<Item>
  updateItem(item: Item): Promise<Item>
  getAllItems(): Promise<Item[]>
  getItem(id: string): Promise<Item>
  searchItems(searchText: string): Promise<Item[]>
}
