import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { IItemsService } from "./items"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Item } from "src/database/mongoose/schemas/Item"
import { ItemDto } from "./dto/item.dto"

@Injectable()
export class ItemsService implements IItemsService {
  constructor(
    @InjectModel("items")
    private readonly itemModel: Model<Item>
  ) {}

  async createItem(item: ItemDto): Promise<Item> {
    try {
      const newItem = new this.itemModel(item)
      return await newItem.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateItem(item: Item): Promise<Item> {
    try {
      const updatedItem = await this.itemModel.findByIdAndUpdate(
        item._id,
        item,
        { new: true }
      )

      if (!updatedItem) {
        throw new HttpException("Item not found", HttpStatus.NOT_FOUND)
      }

      return updatedItem
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllItems(): Promise<Item[]> {
    try {
      return await this.itemModel.find().exec()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getItem(id: string): Promise<Item> {
    try {
      const item = await this.itemModel.findById(id).exec()

      if (!item) {
        throw new HttpException("Item not found", HttpStatus.NOT_FOUND)
      }

      return item
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchItems(searchText: string): Promise<Item[]> {
    try {
      const items = await this.itemModel
        .find({
          name: { $regex: `.*${searchText}.*`, $options: "i" }
        })
        .exec()
      return items
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
