import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException
} from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types, isValidObjectId } from "mongoose"
import { SalesPriceItem } from "../database/mongoose/schemas/SalesPriceItem"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import {
  CreateSalesPriceItemDto,
  UpdateSalesPriceItemDto
} from "./dto/salespriceitems.dto"

@Injectable()
export class SalesPriceItemsService {
  constructor(
    @InjectModel("salespriceitems")
    private readonly salesPriceItemsModel: Model<SalesPriceItem>,
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>
  ) {}

  // helper to ensure we work with a valid ObjectId
  private parseItemId(itemId: string): Types.ObjectId {
    if (!itemId || !isValidObjectId(itemId)) {
      throw new BadRequestException("Invalid itemId")
    }
    return new Types.ObjectId(itemId)
  }

  // helper to ensure the referenced StorageItem exists and is not soft-deleted
  private async ensureStorageItemExists(itemObjectId: Types.ObjectId) {
    const item = await this.storageItemModel.findById(itemObjectId).exec()
    if (!item || (item as any).deletedAt) {
      throw new NotFoundException("Item not found")
    }
  }

  async createSalesPriceItem(
    dto: CreateSalesPriceItemDto
  ): Promise<SalesPriceItem> {
    try {
      const itemObjectId = this.parseItemId(dto.itemId)

      // verify referenced storage item exists
      await this.ensureStorageItemExists(itemObjectId)

      // prevent creating duplicate active price entries for the same item
      const existing = await this.salesPriceItemsModel.findOne({
        itemId: itemObjectId,
        deletedAt: null
      })
      if (existing) {
        throw new BadRequestException(
          "Sales price for this item already exists"
        )
      }

      const newPriceItem = new this.salesPriceItemsModel({
        itemId: itemObjectId,
        price: dto.price,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null
      })
      return await newPriceItem.save()
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error
      throw new InternalServerErrorException("Error creating sales price item")
    }
  }

  async updateSalesPriceItem(
    dto: UpdateSalesPriceItemDto
  ): Promise<SalesPriceItem> {
    try {
      if (!dto.itemId) throw new BadRequestException("itemId is required")
      const itemObjectId = this.parseItemId(dto.itemId)

      // ensure storage item exists
      await this.ensureStorageItemExists(itemObjectId)

      const update: Partial<SalesPriceItem> = {}
      if (typeof dto.price !== "undefined") update.price = dto.price as any
      update.updatedAt = new Date()

      const updatedPriceItem = await this.salesPriceItemsModel.findOneAndUpdate(
        { itemId: itemObjectId, deletedAt: null },
        { $set: update },
        { new: true }
      )

      if (!updatedPriceItem) {
        throw new NotFoundException("Sales price item not found")
      }

      return updatedPriceItem
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error
      }
      throw new InternalServerErrorException("Error updating sales price item")
    }
  }

  async getSalesPriceItems(
    page: number,
    limit: number
  ): Promise<{ data: SalesPriceItem[]; total: number }> {
    try {
      const skip = Math.max(0, (Math.max(1, page) - 1) * Math.max(1, limit))
      const filter = { deletedAt: null }
      const [data, total] = await Promise.all([
        this.salesPriceItemsModel
          .find(filter)
          .sort({ updatedAt: -1 })
          .skip(skip)
          .limit(limit),
        this.salesPriceItemsModel.countDocuments(filter)
      ])
      return { data, total }
    } catch (error) {
      throw new InternalServerErrorException("Error fetching sales price items")
    }
  }

  async getSalesPriceItemByItemId(
    itemId: string
  ): Promise<SalesPriceItem | null> {
    try {
      const itemObjectId = this.parseItemId(itemId)

      // ensure referenced storage item exists
      await this.ensureStorageItemExists(itemObjectId)

      return await this.salesPriceItemsModel.findOne({
        itemId: itemObjectId,
        deletedAt: null
      })
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error
      throw new InternalServerErrorException("Error fetching sales price item")
    }
  }

  // soft-delete: mark deletedAt timestamp instead of removing the document
  async deleteSalesPriceItem(itemId: string): Promise<void> {
    try {
      const itemObjectId = this.parseItemId(itemId)

      // ensure referenced storage item exists
      await this.ensureStorageItemExists(itemObjectId)

      const res = await this.salesPriceItemsModel.findOneAndUpdate(
        { itemId: itemObjectId, deletedAt: null },
        { $set: { deletedAt: new Date(), updatedAt: new Date() } },
        { new: true }
      )
      if (!res) throw new NotFoundException("Sales price item not found")
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      )
        throw error
      throw new InternalServerErrorException("Error deleting sales price item")
    }
  }
}
