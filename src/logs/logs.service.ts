import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { Log, LogProduct } from "src/database/mongoose/schemas/Log"
import { LogDto } from "./dto/log.dto"
import { Types } from "mongoose"
import { isEqual } from "lodash"

@Injectable()
export class LogsService {
  constructor(
    @InjectModel("logs")
    private readonly logModel: Model<Log>
  ) {}

  async createLog(log: LogDto): Promise<Log> {
    try {
      const updatedLog = await this.logModel.findOneAndUpdate(
        { date: log.date },
        { ...log, updatedAt: Date.now() },
        {
          new: true,
          upsert: true
        }
      )
      return updatedLog
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getLogs(page = 1, limit = 10): Promise<{ data: Log[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const [data, total] = await Promise.all([
        this.logModel.find().skip(skip).limit(limit).sort({ date: -1 }).exec(),
        this.logModel.countDocuments().exec()
      ])
      return { data, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getLogsByRange(
    startDate: Date,
    endDate: Date
  ): Promise<{
    startDate: Date
    endDate: Date
    items: { _id: Types.ObjectId; quantity: number }[]
    orders: { products: LogProduct[]; quantity: number }[]
  }> {
    try {
      const logs = await this.logModel
        .find({
          date: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .sort({ date: 1 })
        .exec()

      if (!logs || logs.length === 0) {
        throw new HttpException("Logs not found", HttpStatus.NOT_FOUND)
      }

      const itemsMap = new Map<
        string,
        { _id: Types.ObjectId; quantity: number }
      >()
      logs.forEach((log) => {
        log.items.forEach((item) => {
          const key = item._id.toString()
          if (itemsMap.has(key)) {
            itemsMap.get(key)!.quantity += item.quantity
          } else {
            itemsMap.set(key, { _id: item._id, quantity: item.quantity })
          }
        })
      })
      const mergedItems = Array.from(itemsMap.values())

      const ordersArr: { products: LogProduct[]; quantity: number }[] = []
      logs.forEach((log) => {
        log.orders.forEach((order) => {
          const found = ordersArr.find((o) =>
            isEqual(o.products, order.products)
          )
          if (found) {
            found.quantity += order.quantity
          } else {
            ordersArr.push({
              products: JSON.parse(JSON.stringify(order.products)),
              quantity: order.quantity
            })
          }
        })
      })

      return {
        startDate,
        endDate,
        items: mergedItems,
        orders: ordersArr
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
