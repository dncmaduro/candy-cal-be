import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { StorageLog } from "../database/mongoose/schemas/StorageLog"
import { StorageLogDto } from "./dto/storagelog.dto"
import { startOfMonth, endOfMonth, getDate } from "date-fns"
import { GetMonthStorageLogsReponse } from "./dto/month"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import { toZonedTime, getTimezoneOffset } from "date-fns-tz"

export class StorageLogsService {
  constructor(
    @InjectModel("storagelogs")
    private readonly storageLogsModel: Model<StorageLog>,
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>
  ) {}

  async createRequest(storageLog: StorageLogDto): Promise<StorageLog> {
    try {
      const newStorageLog = new this.storageLogsModel(storageLog)
      const savedLog = await newStorageLog.save()

      const item = await this.storageItemModel.findById(storageLog.item._id)
      if (!item) throw new Error("Item not found")

      if (storageLog.status === "received") {
        item.receivedQuantity.quantity += storageLog.item.quantity
      } else if (storageLog.status === "delivered") {
        item.deliveredQuantity.quantity += storageLog.item.quantity
      }

      item.restQuantity.quantity =
        item.receivedQuantity.quantity - item.deliveredQuantity.quantity

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
      } else if (startDate) {
        query.date = { $gte: new Date(startDate) }
      } else if (endDate) {
        query.date = { $lte: new Date(endDate) }
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
        this.storageLogsModel
          .find(query)
          .sort({ date: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .exec(),
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

      const oldItem = await this.storageItemModel.findById(oldItemId)
      if (!oldItem) throw new Error("Old item not found")

      let newItem =
        oldItemId === newItemId
          ? oldItem
          : await this.storageItemModel.findById(newItemId)
      if (!newItem) throw new Error("New item not found")

      if (existingLog.status === "received") {
        oldItem.receivedQuantity.quantity -= existingLog.item.quantity
      } else if (existingLog.status === "delivered") {
        oldItem.deliveredQuantity.quantity -= existingLog.item.quantity
      }

      oldItem.restQuantity.quantity =
        oldItem.receivedQuantity.quantity - oldItem.deliveredQuantity.quantity
      await oldItem.save()

      if (updatedLog.status === "received") {
        newItem.receivedQuantity.quantity += updatedLog.item.quantity
      } else if (updatedLog.status === "delivered") {
        newItem.deliveredQuantity.quantity += updatedLog.item.quantity
      }

      newItem.restQuantity.quantity =
        newItem.receivedQuantity.quantity - newItem.deliveredQuantity.quantity
      await newItem.save()

      const updated = await this.storageLogsModel.findByIdAndUpdate(
        id,
        updatedLog,
        { new: true }
      )

      return updated
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }

  async getDeliveredLogsByMonth(
    month: number,
    year: number,
    tag?: string
  ): Promise<GetMonthStorageLogsReponse> {
    try {
      const localStart = startOfMonth(new Date(year, month - 1))
      const timeZone = "Asia/Ho_Chi_Minh"
      // Convert local time to UTC by subtracting the timezone offset
      const start = new Date(
        localStart.getTime() - getTimezoneOffset(timeZone, localStart)
      )
      const end = new Date(
        endOfMonth(new Date(year, month - 1)).getTime() -
          getTimezoneOffset(timeZone, endOfMonth(new Date(year, month - 1)))
      )

      const logs = await this.storageLogsModel.find({
        ...(tag && { tag }),
        date: { $gte: start, $lte: end }
      })

      const itemMap = new Map<
        string,
        { deliveredQuantity: number; receivedQuantity: number }
      >()

      const byDayMap = new Map<
        number,
        Map<string, { deliveredQuantity: number; receivedQuantity: number }>
      >()

      logs.forEach((log) => {
        const itemId = log.item._id.toString()
        const quantity = log.item.quantity
        const gmt7Date = toZonedTime(log.date, timeZone)
        const day = gmt7Date.getDate()

        if (!itemMap.has(itemId)) {
          itemMap.set(itemId, { deliveredQuantity: 0, receivedQuantity: 0 })
        }
        const totalStats = itemMap.get(itemId)!
        if (log.status === "delivered") {
          totalStats.deliveredQuantity += quantity
        } else if (log.status === "received") {
          totalStats.receivedQuantity += quantity
        }

        if (!byDayMap.has(day)) byDayMap.set(day, new Map())
        const dayMap = byDayMap.get(day)!
        if (!dayMap.has(itemId)) {
          dayMap.set(itemId, { deliveredQuantity: 0, receivedQuantity: 0 })
        }
        const dayStats = dayMap.get(itemId)!
        if (log.status === "delivered") {
          dayStats.deliveredQuantity += quantity
        } else if (log.status === "received") {
          dayStats.receivedQuantity += quantity
        }
      })

      const itemIds = Array.from(itemMap.keys())
      const items = await this.storageItemModel.find({ _id: { $in: itemIds } })

      const itemNameMap = new Map<string, string>()
      items.forEach((item) => itemNameMap.set(item._id.toString(), item.name))

      const monthItems = items.map((item) => ({
        _id: item._id.toString(),
        name: item.name,
        deliveredQuantity:
          itemMap.get(item._id.toString())?.deliveredQuantity || 0,
        receivedQuantity:
          itemMap.get(item._id.toString())?.receivedQuantity || 0
      }))

      const byDay: GetMonthStorageLogsReponse["byDay"] = Array.from(
        byDayMap.entries()
      )
        .sort((a, b) => a[0] - b[0])
        .map(([day, itemStatsMap]) => ({
          day,
          items: Array.from(itemStatsMap.entries()).map(([itemId, stats]) => ({
            _id: itemId,
            name: itemNameMap.get(itemId) || "",
            deliveredQuantity: stats.deliveredQuantity,
            receivedQuantity: stats.receivedQuantity
          }))
        }))

      return {
        items: monthItems,
        byDay
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

      const item = await this.storageItemModel.findById(log.item._id)
      if (!item) throw new Error("Item not found")

      if (log.status === "received") {
        item.receivedQuantity.quantity -= log.item.quantity
      } else if (log.status === "delivered") {
        item.deliveredQuantity.quantity -= log.item.quantity
      }

      item.restQuantity.quantity =
        item.receivedQuantity.quantity - item.deliveredQuantity.quantity

      if (
        item.receivedQuantity.quantity < 0 ||
        item.deliveredQuantity.quantity < 0 ||
        item.restQuantity.quantity < 0
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

  async deleteStorageLogsCreatedByDeliveredRequest(deliveredRequestId: string) {
    try {
      const logs = await this.storageLogsModel.find({
        deliveredRequestId
      })

      if (logs.length === 0) return

      logs.forEach(async (log) => {
        await this.deleteStorageLog(log._id.toString())
      })
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }
}
