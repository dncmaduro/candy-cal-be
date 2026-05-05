import { InjectModel } from "@nestjs/mongoose"
import { BadRequestException } from "@nestjs/common"
import { Model, Types } from "mongoose"
import { StorageLog } from "../database/mongoose/schemas/StorageLog"
import { StorageLogDto } from "./dto/storagelog.dto"
import { startOfMonth, endOfMonth, getDate } from "date-fns"
import { GetMonthStorageLogsReponse } from "./dto/month"
import { StorageItem } from "../database/mongoose/schemas/StorageItem"
import { toZonedTime, getTimezoneOffset } from "date-fns-tz"
import { DeliveredRequest } from "../database/mongoose/schemas/DeliveredRequest"

export class StorageLogsService {
  constructor(
    @InjectModel("storagelogs")
    private readonly storageLogsModel: Model<StorageLog>,
    @InjectModel("storageitems")
    private readonly storageItemModel: Model<StorageItem>,
    @InjectModel("deliveredrequests")
    private readonly deliveredRequestModel: Model<DeliveredRequest>
  ) {}

  // Helper function to get items from both old and new format
  private getItemsFromLog(
    log: StorageLog
  ): Array<{ _id: string; quantity: number }> {
    if (log.items && log.items.length > 0) {
      return log.items.map((item) => ({
        _id: item._id.toString(),
        quantity: item.quantity
      }))
    } else if (log.item) {
      return [
        {
          _id: log.item._id.toString(),
          quantity: log.item.quantity
        }
      ]
    }
    return []
  }

  private getQuantitiesAfterDeletingLog(
    receivedQuantity: number,
    deliveredQuantity: number,
    status: string,
    quantity: number
  ): {
    receivedQuantity: number
    deliveredQuantity: number
    restQuantity: number
  } {
    let nextReceivedQuantity = receivedQuantity
    let nextDeliveredQuantity = deliveredQuantity

    if (status === "received") {
      nextReceivedQuantity -= quantity
    } else if (status === "delivered") {
      nextDeliveredQuantity -= quantity
    } else if (status === "returned") {
      nextDeliveredQuantity += quantity
    }

    return {
      receivedQuantity: nextReceivedQuantity,
      deliveredQuantity: nextDeliveredQuantity,
      restQuantity: nextReceivedQuantity - nextDeliveredQuantity
    }
  }

  private buildNegativeDeletionErrorMessage(itemName: string): string {
    return `Không thể thực hiện thao tác vì sẽ làm số lượng kho bị âm cho mặt hàng ${itemName}. Vui lòng kiểm tra lại lịch sử nhập/xuất kho liên quan trước khi tiếp tục.`
  }

  private assertNonNegativeQuantities(
    itemName: string,
    receivedQuantity: number,
    deliveredQuantity: number,
    restQuantity: number
  ): void {
    if (
      receivedQuantity < 0 ||
      deliveredQuantity < 0 ||
      restQuantity < 0
    ) {
      throw new BadRequestException(
        this.buildNegativeDeletionErrorMessage(itemName)
      )
    }
  }

  async validateCanDeleteStorageLogsCreatedByDeliveredRequest(
    deliveredRequestId: string
  ): Promise<void> {
    const logs = await this.storageLogsModel.find({
      deliveredRequestId
    })

    if (logs.length === 0) return

    const itemStateMap = new Map<
      string,
      { name: string; receivedQuantity: number; deliveredQuantity: number }
    >()

    for (const log of logs) {
      const logItems = this.getItemsFromLog(log)
      for (const logItem of logItems) {
        const itemId = logItem._id
        let state = itemStateMap.get(itemId)

        if (!state) {
          const item = await this.storageItemModel.findById(itemId)
          if (!item) {
            throw new BadRequestException(`Không tìm thấy mặt hàng ${itemId}`)
          }
          state = {
            name: item.name,
            receivedQuantity: item.receivedQuantity.quantity,
            deliveredQuantity: item.deliveredQuantity.quantity
          }
          itemStateMap.set(itemId, state)
        }

        const next = this.getQuantitiesAfterDeletingLog(
          state.receivedQuantity,
          state.deliveredQuantity,
          log.status,
          logItem.quantity
        )

        this.assertNonNegativeQuantities(
          state.name,
          next.receivedQuantity,
          next.deliveredQuantity,
          next.restQuantity
        )

        state.receivedQuantity = next.receivedQuantity
        state.deliveredQuantity = next.deliveredQuantity
      }
    }
  }

  async getDeliveredQuantitySumByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<number> {
    try {
      const result = await this.storageLogsModel
        .aggregate<{ totalQuantity: number }>([
          {
            $match: {
              status: "delivered",
              date: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $project: {
              itemsToSum: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
                  "$items",
                  [{ $ifNull: ["$item", null] }]
                ]
              }
            }
          },
          { $unwind: "$itemsToSum" },
          { $match: { "itemsToSum._id": { $ne: null } } },
          {
            $group: {
              _id: null,
              totalQuantity: { $sum: "$itemsToSum.quantity" }
            }
          }
        ])
        .exec()

      if (result.length === 0) return 0
      return result[0]?.totalQuantity ?? 0
    } catch (error) {
      console.error(error)
      if (error instanceof BadRequestException) throw error
      throw new Error("Internal server error")
    }
  }

  async getDeliveredQuantitySummaryByDateRange(
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalQuantity: number
    byItem: Array<{
      itemId: string
      totalQuantity: number
      item?: { _id: string; code: string; name: string; quantityPerBox: number }
    }>
  }> {
    try {
      const result = await this.storageLogsModel
        .aggregate<{
          overall: Array<{ totalQuantity: number }>
          byItem: Array<{
            _id: any
            totalQuantity: number
            item?: Array<{
              _id: any
              code: string
              name: string
              quantityPerBox: number
            }>
          }>
        }>([
          {
            $match: {
              status: "delivered",
              date: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $project: {
              itemsToSum: {
                $cond: [
                  { $gt: [{ $size: { $ifNull: ["$items", []] } }, 0] },
                  "$items",
                  [{ $ifNull: ["$item", null] }]
                ]
              }
            }
          },
          { $unwind: "$itemsToSum" },
          { $match: { "itemsToSum._id": { $ne: null } } },
          {
            $facet: {
              overall: [
                {
                  $group: {
                    _id: null,
                    totalQuantity: { $sum: "$itemsToSum.quantity" }
                  }
                }
              ],
              byItem: [
                {
                  $group: {
                    _id: "$itemsToSum._id",
                    totalQuantity: { $sum: "$itemsToSum.quantity" }
                  }
                },
                {
                  $lookup: {
                    from: "storageitems",
                    localField: "_id",
                    foreignField: "_id",
                    as: "item"
                  }
                }
              ]
            }
          }
        ])
        .exec()

      const overallTotal = result?.[0]?.overall?.[0]?.totalQuantity ?? 0
      const byItemRaw = result?.[0]?.byItem ?? []

      return {
        totalQuantity: overallTotal,
        byItem: byItemRaw.map((row) => {
          const itemDoc = row.item?.[0]
          return {
            itemId: row._id?.toString?.() ?? String(row._id),
            totalQuantity: row.totalQuantity,
            item: itemDoc
              ? {
                  _id: itemDoc._id?.toString?.() ?? String(itemDoc._id),
                  code: itemDoc.code,
                  name: itemDoc.name,
                  quantityPerBox: itemDoc.quantityPerBox
                }
              : undefined
          }
        })
      }
    } catch (error) {
      console.error(error)
      throw new Error("Internal server error")
    }
  }

  async createRequest(storageLog: StorageLogDto): Promise<StorageLog> {
    try {
      // Only create new format with items array
      const newStorageLog = new this.storageLogsModel({
        items: storageLog.items,
        note: storageLog.note,
        status: storageLog.status,
        date: storageLog.date,
        tag: storageLog.tag,
        deliveredRequestId: storageLog.deliveredRequestId
      })
      const savedLog = await newStorageLog.save()

      // Update storage items quantities
      for (const logItem of storageLog.items) {
        const item = await this.storageItemModel.findById(logItem._id)
        if (!item) throw new Error(`Item with id ${logItem._id} not found`)

        if (storageLog.status === "received") {
          item.receivedQuantity.quantity += logItem.quantity
        } else if (storageLog.status === "delivered") {
          item.deliveredQuantity.quantity += logItem.quantity
        } else if (storageLog.status === "returned") {
          item.deliveredQuantity.quantity -= logItem.quantity
        }

        item.restQuantity.quantity =
          item.receivedQuantity.quantity - item.deliveredQuantity.quantity

        await item.save()
      }

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
    itemId?: string,
    channelId?: string
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
        query.$or = [
          { "item._id": itemId }, // Old format
          { "items._id": itemId } // New format
        ]
      }

      if (channelId) {
        if (!Types.ObjectId.isValid(channelId)) {
          throw new BadRequestException("channelId is invalid")
        }

        const deliveredRequestIds = await this.deliveredRequestModel
          .find(
            { channel: new Types.ObjectId(channelId) },
            { _id: 1 }
          )
          .lean()
          .exec()

        query.deliveredRequestId = {
          $in: deliveredRequestIds.map((request) => request._id)
        }
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

      // Get items from existing log (handle both old and new format)
      const existingItems = this.getItemsFromLog(existingLog)

      // Revert the quantities of existing items
      for (const existingItem of existingItems) {
        const item = await this.storageItemModel.findById(existingItem._id)
        if (!item) continue

        if (existingLog.status === "received") {
          item.receivedQuantity.quantity -= existingItem.quantity
        } else if (existingLog.status === "delivered") {
          item.deliveredQuantity.quantity -= existingItem.quantity
        } else if (existingLog.status === "returned") {
          item.deliveredQuantity.quantity += existingItem.quantity
        }

        item.restQuantity.quantity =
          item.receivedQuantity.quantity - item.deliveredQuantity.quantity
        await item.save()
      }

      // Apply the new quantities from updated log
      for (const newItem of updatedLog.items) {
        const item = await this.storageItemModel.findById(newItem._id)
        if (!item) throw new Error(`Item with id ${newItem._id} not found`)

        if (updatedLog.status === "received") {
          item.receivedQuantity.quantity += newItem.quantity
        } else if (updatedLog.status === "delivered") {
          item.deliveredQuantity.quantity += newItem.quantity
        } else if (updatedLog.status === "returned") {
          item.deliveredQuantity.quantity -= newItem.quantity
        }

        item.restQuantity.quantity =
          item.receivedQuantity.quantity - item.deliveredQuantity.quantity
        await item.save()
      }

      // Update the log with new format
      const updated = await this.storageLogsModel.findByIdAndUpdate(
        id,
        {
          items: updatedLog.items,
          note: updatedLog.note,
          status: updatedLog.status,
          date: updatedLog.date,
          tag: updatedLog.tag,
          deliveredRequestId: updatedLog.deliveredRequestId,
          $unset: { item: 1 } // Remove old item field if exists
        },
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
        const items = this.getItemsFromLog(log)
        const gmt7Date = toZonedTime(log.date, timeZone)
        const day = gmt7Date.getDate()

        items.forEach((logItem) => {
          const itemId = logItem._id
          const quantity = logItem.quantity

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

  async deleteStorageLog(
    id: string,
    options?: { allowNegativeQuantities?: boolean }
  ): Promise<void> {
    try {
      const log = await this.storageLogsModel.findById(id)
      if (!log) throw new BadRequestException("Không tìm thấy log kho")

      const items = this.getItemsFromLog(log)
      const allowNegativeQuantities = options?.allowNegativeQuantities === true

      // Revert quantities for all items in the log
      for (const logItem of items) {
        const item = await this.storageItemModel.findById(logItem._id)
        if (!item) {
          throw new BadRequestException(
            `Không tìm thấy mặt hàng ${logItem._id}`
          )
        }

        const next = this.getQuantitiesAfterDeletingLog(
          item.receivedQuantity.quantity,
          item.deliveredQuantity.quantity,
          log.status,
          logItem.quantity
        )

        if (!allowNegativeQuantities) {
          this.assertNonNegativeQuantities(
            item.name,
            next.receivedQuantity,
            next.deliveredQuantity,
            next.restQuantity
          )
        }

        item.receivedQuantity.quantity = next.receivedQuantity
        item.deliveredQuantity.quantity = next.deliveredQuantity
        item.restQuantity.quantity = next.restQuantity
        await item.save()
      }

      await this.storageLogsModel.findByIdAndDelete(id)
    } catch (error) {
      console.error(error)
      if (error instanceof BadRequestException) throw error
      throw new Error("Internal server error")
    }
  }

  async deleteStorageLogsCreatedByDeliveredRequest(
    deliveredRequestId: string,
    options?: { allowNegativeQuantities?: boolean; precheckNegative?: boolean }
  ) {
    try {
      const logs = await this.storageLogsModel.find({
        deliveredRequestId
      })

      if (logs.length === 0) return
      const allowNegativeQuantities = options?.allowNegativeQuantities === true
      const precheckNegative = options?.precheckNegative !== false

      if (!allowNegativeQuantities && precheckNegative) {
        await this.validateCanDeleteStorageLogsCreatedByDeliveredRequest(
          deliveredRequestId
        )
      }

      for (const log of logs) {
        await this.deleteStorageLog(log._id.toString(), {
          allowNegativeQuantities
        })
      }
    } catch (error) {
      console.error(error)
      if (error instanceof BadRequestException) throw error
      throw new Error("Internal server error")
    }
  }
}
