import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import { StorageItemDto } from "./dto/storageitems.dto"

@Injectable()
export class StorageItemsService {
  constructor(
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>
  ) {}

  async createItem(item: StorageItemDto): Promise<StorageItem> {
    try {
      const newItem = new this.storageItemModel(item)
      return await newItem.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateItem(item: StorageItem): Promise<StorageItem> {
    try {
      const updatedItem = await this.storageItemModel.findByIdAndUpdate(
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

  async getAllItemsForOrderPage(): Promise<string[]> {
    try {
      const items = await this.storageItemModel.find({ deletedAt: null }).exec()
      return items.map((i) => i.get("name"))
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getItem(id: string): Promise<StorageItem> {
    try {
      const item = await this.storageItemModel.findById(id).exec()

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

  // Updated: accept optional searchText and optional deleted filter
  async searchItems(
    searchText?: string,
    deleted?: boolean | undefined
  ): Promise<StorageItem[]> {
    try {
      const filter: any = {}

      if (typeof deleted === "boolean") {
        filter.deletedAt = deleted ? { $ne: null } : null
      }

      if (searchText && searchText.trim().length > 0) {
        filter.name = { $regex: `.*${searchText}.*`, $options: "i" }
      }

      const items = await this.storageItemModel.find(filter).exec()
      return items
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllItemsForStoragePage(): Promise<StorageItem[]> {
    try {
      const items = await this.storageItemModel.find({ deletedAt: null }).exec()
      return items
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Soft delete: set deletedAt to now
  async deleteItem(id: string): Promise<void> {
    try {
      const res = await this.storageItemModel.findByIdAndUpdate(
        id,
        { $set: { deletedAt: new Date() } },
        { new: true }
      )
      if (!res) {
        throw new HttpException("Item not found", HttpStatus.NOT_FOUND)
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async restoreItem(id: string): Promise<void> {
    try {
      const res = await this.storageItemModel.findByIdAndUpdate(
        id,
        { $set: { deletedAt: null } },
        { new: true }
      )
      if (!res) {
        throw new HttpException("Item not found", HttpStatus.NOT_FOUND)
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
