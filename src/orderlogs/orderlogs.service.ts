import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import {
  OrderLog,
  OrderLogItem,
  OrderLogProduct
} from "../database/mongoose/schemas/OrderLog"
import { OrderLogSessionDto } from "./dto/orderlogs.dto"
import { isEqual } from "lodash"

@Injectable()
export class OrderLogsService {
  constructor(
    @InjectModel("orderlogs")
    private readonly orderLogModel: Model<OrderLog>
  ) {}

  async createLogSession(sessionDto: OrderLogSessionDto): Promise<OrderLog> {
    try {
      let orderLog = await this.orderLogModel.findOne({ date: sessionDto.date })

      const emptySession = { items: [], orders: [] }

      if (!orderLog) {
        const newLog: Partial<OrderLog> = {
          morning: sessionDto.session === "morning" ? sessionDto : emptySession,
          afternoon:
            sessionDto.session === "afternoon" ? sessionDto : emptySession,
          date: sessionDto.date,
          updatedAt: new Date()
        }
        orderLog = await this.orderLogModel.create(newLog)
      } else {
        if (sessionDto.session === "morning") {
          orderLog.morning = {
            orders: sessionDto.orders,
            items: sessionDto.items.map((item) => ({
              ...item,
              _id: new Types.ObjectId(item._id)
            }))
          }
        } else {
          orderLog.afternoon = {
            orders: sessionDto.orders,
            items: sessionDto.items.map((item) => ({
              ...item,
              _id: new Types.ObjectId(item._id)
            }))
          }
        }
        orderLog.updatedAt = new Date()
        await orderLog.save()
      }

      return orderLog
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getOrderLogs(
    page = 1,
    limit = 10
  ): Promise<{ data: OrderLog[]; total: number }> {
    try {
      const skip = (page - 1) * limit
      const [data, total] = await Promise.all([
        this.orderLogModel
          .find()
          .skip(skip)
          .limit(limit)
          .sort({ date: -1 })
          .exec(),
        this.orderLogModel.countDocuments().exec()
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

  async getOrderLogsByRange(
    startDate: Date,
    endDate: Date,
    session: "morning" | "afternoon" | "all"
  ): Promise<{
    startDate: Date
    endDate: Date
    items: {
      _id: Types.ObjectId
      quantity: number
      storageItems: OrderLogItem["storageItems"]
    }[]
    orders: { products: OrderLogProduct[]; quantity: number }[]
    total: number
  }> {
    try {
      const logs = await this.orderLogModel
        .find({
          date: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .sort({ date: 1 })
        .exec()

      if (!logs || logs.length === 0) {
        throw new HttpException("OrderLogs not found", HttpStatus.NOT_FOUND)
      }

      const itemsMap = new Map<
        string,
        {
          _id: Types.ObjectId
          quantity: number
          storageItems: OrderLogItem["storageItems"]
        }
      >()

      const ordersArr: { products: OrderLogProduct[]; quantity: number }[] = []

      logs.forEach((log) => {
        const sessions =
          session === "all" ? [log.morning, log.afternoon] : [log[session]]

        sessions.forEach((sess) => {
          if (!sess) return
          sess.items.forEach((item) => {
            const key = item._id.toString()
            if (itemsMap.has(key)) {
              itemsMap.get(key)!.quantity += item.quantity
            } else {
              itemsMap.set(key, {
                _id: item._id,
                quantity: item.quantity,
                storageItems: item.storageItems
              })
            }
          })
          sess.orders.forEach((order) => {
            const found = ordersArr.find((o) => {
              return order.products.every((p) => {
                return (
                  p.quantity ===
                  o.products.find((op) => isEqual(op.name, p.name))?.quantity
                )
              })
            })
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
      })

      const mergedItems = Array.from(itemsMap.values())
      const total = ordersArr.reduce((acc, order) => acc + order.quantity, 0)

      return {
        startDate,
        endDate,
        items: mergedItems,
        orders: ordersArr,
        total
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
