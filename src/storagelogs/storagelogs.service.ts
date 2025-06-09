import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { StorageLog } from "../database/mongoose/schemas/StorageLog"
import { StorageLogDto } from "./dto/storagelog.dto"
import { Item } from "../database/mongoose/schemas/Item"
import { startOfMonth, endOfMonth } from "date-fns"
import { GetMonthStorageLogsReponse } from "./dto/month"

export class StorageLogsService {
  constructor(
    @InjectModel("storagelogs")
    private readonly storageLogsModel: Model<StorageLog>,
    @InjectModel("items")
    private readonly itemModel: Model<Item>
  ) {}

  async createRequest(storageLog: StorageLogDto): Promise<StorageLog> {
    try {
      const newStorageLog = new this.storageLogsModel(storageLog)
      const savedLog = await newStorageLog.save()

      const item = await this.itemModel.findById(storageLog.item._id)
      if (!item) throw new Error("Item not found")

      if (storageLog.status === "received") {
        item.receivedQuantity.quantity += storageLog.item.quantity
      } else if (storageLog.status === "delivered") {
        item.deliveredQuantity.quantity += storageLog.item.quantity
      }

      await item.save()
      return savedLog
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }

  async getStorageLogs(
    page = 1,
    limit = 10,
    startDate?: string,
    endDate?: string,
    status?: string,
    tag?: string,
    itemId?: string
  ): Promise<{
    data: StorageLog[]
    total: number
  }> {
    try {
      const skip = (page - 1) * limit
      const query: any = {}

      if (startDate && endDate) {
        query.date = {
          $gte: new Date(startDate),
          $lte: new Date(endDate)
        }
      }
      if (status) {
        query.status = status
      }
      if (tag) {
        query.tag = tag
      }
      if (itemId) {
        query["item._id"] = itemId
      }

      const [data, total] = await Promise.all([
        this.storageLogsModel.find(query).skip(skip).limit(limit).exec(),
        this.storageLogsModel.countDocuments(query).exec()
      ])
      return { data, total }
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }

  async getStorageLogById(id: string): Promise<StorageLog | null> {
    try {
      return await this.storageLogsModel.findById(id).exec()
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }

  async updateStorageLog(
    id: string,
    updatedLog: StorageLogDto
  ): Promise<StorageLog | null> {
    try {
      const existingLog = await this.storageLogsModel.findById(id)
      if (!existingLog) throw new Error("Storage log not found")

      const oldItemId = existingLog.item._id.toString()
      const newItemId = updatedLog.item._id.toString()

      const oldItem = await this.itemModel.findById(oldItemId)
      if (!oldItem) throw new Error("Old item not found")

      let newItem =
        oldItemId === newItemId
          ? oldItem
          : await this.itemModel.findById(newItemId)
      if (!newItem) throw new Error("New item not found")

      // 1. Rollback old item's quantity
      if (existingLog.status === "received") {
        oldItem.receivedQuantity.quantity -= existingLog.item.quantity
      } else if (existingLog.status === "delivered") {
        oldItem.deliveredQuantity.quantity -= existingLog.item.quantity
      }

      // Check không âm
      if (
        oldItem.receivedQuantity.quantity < 0 ||
        oldItem.deliveredQuantity.quantity < 0
      ) {
        throw new Error("Item quantity cannot be negative")
      }

      await oldItem.save()

      // 2. Apply new quantity
      if (updatedLog.status === "received") {
        newItem.receivedQuantity.quantity += updatedLog.item.quantity
      } else if (updatedLog.status === "delivered") {
        newItem.deliveredQuantity.quantity += updatedLog.item.quantity
      }

      if (
        newItem.receivedQuantity.quantity < 0 ||
        newItem.deliveredQuantity.quantity < 0
      ) {
        throw new Error("Item quantity cannot be negative after update")
      }

      await newItem.save()

      // 3. Update log
      const updated = await this.storageLogsModel.findByIdAndUpdate(
        id,
        updatedLog,
        {
          new: true
        }
      )

      return updated
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }

  async getDeliveredLogsByMonth(
    month: number,
    year: number
  ): Promise<GetMonthStorageLogsReponse> {
    try {
      const start = startOfMonth(new Date(year, month - 1))
      const end = endOfMonth(new Date(year, month - 1))

      const logs = await this.storageLogsModel.find({
        date: { $gte: start, $lte: end }
      })

      const itemMap = new Map<
        string,
        { deliveredQuantity: number; receivedQuantity: number }
      >()

      logs.forEach((log) => {
        const itemId = log.item._id.toString()
        const quantity = log.item.quantity

        if (!itemMap.has(itemId)) {
          itemMap.set(itemId, {
            deliveredQuantity: 0,
            receivedQuantity: 0
          })
        }

        const itemStats = itemMap.get(itemId)!
        if (log.status === "delivered") {
          itemStats.deliveredQuantity += quantity
        } else if (log.status === "received") {
          itemStats.receivedQuantity += quantity
        }
      })

      const itemIds = Array.from(itemMap.keys())
      const items = await this.itemModel.find({ _id: { $in: itemIds } })

      return {
        items: items.map((item) => ({
          _id: item._id.toString(),
          name: item.name,
          deliveredQuantity:
            itemMap.get(item._id.toString())?.deliveredQuantity || 0,
          receivedQuantity:
            itemMap.get(item._id.toString())?.receivedQuantity || 0
        }))
      }
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }

  async deleteStorageLog(id: string): Promise<void> {
    try {
      const log = await this.storageLogsModel.findById(id)
      if (!log) throw new Error("Storage log not found")

      const item = await this.itemModel.findById(log.item._id)
      if (!item) throw new Error("Item not found")

      if (log.status === "received") {
        item.receivedQuantity.quantity -= log.item.quantity
      } else if (log.status === "delivered") {
        item.deliveredQuantity.quantity -= log.item.quantity
      }

      // Check không âm
      if (
        item.receivedQuantity.quantity < 0 ||
        item.deliveredQuantity.quantity < 0
      ) {
        throw new Error("Item quantity cannot be negative after deletion")
      }

      await item.save()
      await this.storageLogsModel.findByIdAndDelete(id)
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }
}
