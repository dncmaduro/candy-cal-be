import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import * as XLSX from "xlsx"
import * as ExcelJS from "exceljs"
import {
  SalesOrder,
  SalesOrderShippingType,
  SalesOrderStorage
} from "../database/mongoose/schemas/SalesOrder"
import { SalesItem } from "../database/mongoose/schemas/SalesItem"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"

@Injectable()
export class SalesOrdersService {
  constructor(
    @InjectModel("salesorders")
    private readonly salesOrderModel: Model<SalesOrder>,
    @InjectModel("salesitems")
    private readonly salesItemModel: Model<SalesItem>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>
  ) {}

  async createOrder(payload: {
    salesFunnelId: string
    items: { code: string; quantity: number }[]
    storage: SalesOrderStorage
    date: Date
  }): Promise<SalesOrder> {
    try {
      // Get sales funnel
      const funnel = await this.salesFunnelModel.findById(payload.salesFunnelId)
      if (!funnel) {
        throw new HttpException("Sales funnel not found", HttpStatus.NOT_FOUND)
      }

      // Determine returning based on hasBuyed
      const returning = funnel.hasBuyed

      // Build sales items with name and price from SalesItem
      const itemsWithDetails = await Promise.all(
        payload.items.map(async (item) => {
          // Get sales item for name and price
          const salesItem = await this.salesItemModel
            .findOne({ code: item.code })
            .lean()
          if (!salesItem) {
            throw new HttpException(
              `Sales item with code ${item.code} not found`,
              HttpStatus.NOT_FOUND
            )
          }

          return {
            code: item.code,
            name: salesItem.name.vn, // Use Vietnamese name
            price: salesItem.price,
            quantity: item.quantity
          }
        })
      )

      // Calculate total
      const total = itemsWithDetails.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      )

      // Create order
      const order = new this.salesOrderModel({
        salesFunnelId: new Types.ObjectId(payload.salesFunnelId),
        items: itemsWithDetails,
        returning,
        storage: payload.storage,
        date: payload.date,
        total
      })

      const saved = await order.save()

      // Update hasBuyed to true if it was false
      if (!funnel.hasBuyed) {
        await this.markFunnelAsBuyed(payload.salesFunnelId)
      }

      return saved
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateOrderItems(
    orderId: string,
    items: { code: string; quantity: number; price?: number }[],
    storage?: SalesOrderStorage
  ): Promise<SalesOrder> {
    try {
      const order = await this.salesOrderModel.findById(orderId)
      if (!order) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }

      // Build sales items with name and price from SalesItem
      const itemsWithDetails = await Promise.all(
        items.map(async (item) => {
          const salesItem = await this.salesItemModel
            .findOne({ code: item.code })
            .lean()
          if (!salesItem) {
            throw new HttpException(
              `Sales item with code ${item.code} not found`,
              HttpStatus.NOT_FOUND
            )
          }

          // Use provided price or fall back to SalesItem price
          const finalPrice =
            item.price !== undefined ? item.price : salesItem.price

          return {
            code: item.code,
            name: salesItem.name.vn, // Use Vietnamese name
            price: finalPrice,
            quantity: item.quantity
          }
        })
      )

      // Recalculate total based on item price * quantity
      const total = itemsWithDetails.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      )

      order.items = itemsWithDetails
      order.total = total
      if (storage !== undefined) {
        order.storage = storage
      }
      order.updatedAt = new Date()

      return await order.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteOrder(orderId: string): Promise<void> {
    try {
      const order = await this.salesOrderModel.findById(orderId)
      if (!order) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }

      const salesFunnelId = order.salesFunnelId

      // Delete the order
      await this.salesOrderModel.findByIdAndDelete(orderId)

      // Check remaining orders for this funnel
      const remainingCount = await this.salesOrderModel.countDocuments({
        salesFunnelId
      })

      // If no orders left, set hasBuyed back to false
      if (remainingCount === 0) {
        await this.resetFunnelBuyStatus(salesFunnelId.toString())
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi xóa đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateShippingInfo(
    orderId: string,
    shippingCode?: string,
    shippingType?: SalesOrderShippingType
  ): Promise<SalesOrder> {
    try {
      const updateData: any = { updatedAt: new Date() }

      if (shippingCode !== undefined) {
        updateData.shippingCode = shippingCode
      }

      if (shippingType !== undefined) {
        updateData.shippingType = shippingType
      }

      const updated = await this.salesOrderModel.findByIdAndUpdate(
        orderId,
        { $set: updateData },
        { new: true }
      )
      if (!updated) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }
      return updated
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật thông tin vận chuyển",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchOrders(
    filters: {
      salesFunnelId?: string
      returning?: boolean
      startDate?: Date
      endDate?: Date
      searchText?: string
      shippingType?: SalesOrderShippingType
    },
    page = 1,
    limit = 10
  ): Promise<{ data: SalesOrder[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter: any = {}
      if (filters.salesFunnelId)
        filter.salesFunnelId = new Types.ObjectId(filters.salesFunnelId)
      if (filters.returning !== undefined) filter.returning = filters.returning
      if (filters.shippingType) filter.shippingType = filters.shippingType

      if (filters.startDate || filters.endDate) {
        filter.date = {}
        if (filters.startDate) filter.date.$gte = filters.startDate
        if (filters.endDate) filter.date.$lte = filters.endDate
      }

      if (filters.searchText && filters.searchText.trim().length > 0) {
        const searchRegex = {
          $regex: `.*${filters.searchText.trim()}.*`,
          $options: "i"
        }
        filter.$or = [
          { shippingCode: searchRegex },
          { "items.code": searchRegex },
          { "items.name": searchRegex }
        ]
      }

      const [orders, total] = await Promise.all([
        this.salesOrderModel
          .find(filter)
          .populate("salesFunnelId")
          .sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        this.salesOrderModel.countDocuments(filter)
      ])

      // Enrich items with factory and source information
      const enrichedOrders = await Promise.all(
        orders.map(async (order) => {
          const enrichedItems = await Promise.all(
            order.items.map(async (item) => {
              const salesItem = await this.salesItemModel
                .findOne({ code: item.code })
                .lean()

              return {
                ...item,
                factory: salesItem?.factory,
                source: salesItem?.source
              }
            })
          )

          return {
            ...order,
            items: enrichedItems
          }
        })
      )

      return { data: enrichedOrders as SalesOrder[], total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tìm kiếm đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getOrderById(orderId: string): Promise<SalesOrder | null> {
    try {
      const order = await this.salesOrderModel
        .findById(orderId)
        .populate("salesFunnelId")
        .lean()

      if (!order) {
        return null
      }

      // Enrich items with factory and source information
      const enrichedItems = await Promise.all(
        order.items.map(async (item) => {
          const salesItem = await this.salesItemModel
            .findOne({ code: item.code })
            .lean()

          return {
            ...item,
            factory: salesItem?.factory,
            source: salesItem?.source
          }
        })
      )

      return {
        ...order,
        items: enrichedItems
      } as SalesOrder
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy thông tin đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateStorage(
    orderId: string,
    storage: SalesOrderStorage
  ): Promise<SalesOrder> {
    try {
      const updated = await this.salesOrderModel.findByIdAndUpdate(
        orderId,
        { $set: { storage, updatedAt: new Date() } },
        { new: true }
      )
      if (!updated) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }
      return updated
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật kho",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getAllStorages(): Promise<{
    data: Array<{ value: SalesOrderStorage; label: string }>
  }> {
    const storages: Array<{ value: SalesOrderStorage; label: string }> = [
      { value: "position_HaNam", label: "Hà Nam" },
      { value: "position_MKT", label: "MKT" }
    ]
    return { data: storages }
  }

  async getAllShippingTypes(): Promise<{
    data: Array<{ value: SalesOrderShippingType; label: string }>
  }> {
    const shippingTypes: Array<{
      value: SalesOrderShippingType
      label: string
    }> = [
      { value: "shipping_vtp", label: "Viettel Post" },
      { value: "shipping_cargo", label: "Chành xe" }
    ]
    return { data: shippingTypes }
  }

  // Helper methods for sales funnel status
  private async markFunnelAsBuyed(funnelId: string): Promise<void> {
    await this.salesFunnelModel.findByIdAndUpdate(funnelId, {
      $set: { hasBuyed: true }
    })
  }

  private async resetFunnelBuyStatus(funnelId: string): Promise<void> {
    await this.salesFunnelModel.findByIdAndUpdate(funnelId, {
      $set: { hasBuyed: false }
    })
  }

  async exportOrdersToExcel(filters: {
    salesFunnelId?: string
    returning?: boolean
    startDate?: Date
    endDate?: Date
    searchText?: string
    shippingType?: SalesOrderShippingType
  }): Promise<Buffer> {
    try {
      // Build filter (same as searchOrders but without pagination)
      const filter: any = {}
      if (filters.salesFunnelId)
        filter.salesFunnelId = new Types.ObjectId(filters.salesFunnelId)
      if (filters.returning !== undefined) filter.returning = filters.returning
      if (filters.shippingType) filter.shippingType = filters.shippingType

      if (filters.startDate || filters.endDate) {
        filter.date = {}
        if (filters.startDate) filter.date.$gte = filters.startDate
        if (filters.endDate) filter.date.$lte = filters.endDate
      }

      if (filters.searchText && filters.searchText.trim().length > 0) {
        const searchRegex = {
          $regex: `.*${filters.searchText.trim()}.*`,
          $options: "i"
        }
        filter.$or = [
          { shippingCode: searchRegex },
          { "items.code": searchRegex },
          { "items.name": searchRegex }
        ]
      }

      // Get all orders matching filter
      const orders = await this.salesOrderModel
        .find(filter)
        .populate("salesFunnelId")
        .sort({ createdAt: -1 })
        .lean()

      // Build rows - each item in each order becomes a row
      const rows: any[] = []

      for (const order of orders) {
        const funnel = order.salesFunnelId as any
        const funnelName = funnel?.name || ""
        const shippingTypeLabel = this.getShippingTypeLabel(order.shippingType)
        const storageLabel = this.getStorageLabel(order.storage)
        const dateStr = this.formatDate(order.date)

        for (const item of order.items) {
          // Get sales item for additional info (Chinese name, factory, source)
          const salesItem = await this.salesItemModel
            .findOne({ code: item.code })
            .lean()

          const chineseName = salesItem?.name?.cn || ""
          const factory = salesItem?.factory || ""
          const factoryLabel = this.getFactoryLabel(factory as any)
          const source = salesItem?.source || ""
          const sourceLabel = this.getSourceLabel(source as any)

          const thanhTien = item.price * item.quantity

          rows.push([
            item.code,
            dateStr,
            item.name,
            chineseName,
            item.quantity,
            item.price,
            thanhTien,
            "",
            "",
            "",
            thanhTien,
            "",
            funnelName,
            shippingTypeLabel,
            factoryLabel,
            "",
            sourceLabel,
            storageLabel
          ])
        }
      }

      // Create workbook using ExcelJS
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet("Orders")

      // Define columns with headers
      worksheet.columns = [
        { header: "Mã sp", key: "code", width: 12 },
        { header: "Ngày tháng", key: "date", width: 12 },
        { header: "Tên Sp", key: "name", width: 25 },
        { header: "Tên Sp tiếng trung", key: "chineseName", width: 25 },
        { header: "Số lượng", key: "quantity", width: 10 },
        { header: "Đơn giá", key: "price", width: 12 },
        { header: "Thành tiền", key: "total", width: 15 },
        { header: "Thuế", key: "tax", width: 10 },
        { header: "Tiền ship", key: "shipping", width: 10 },
        { header: "Khách trả tiền xe trước", key: "prepaid", width: 20 },
        { header: "Thu tiền", key: "collected", width: 15 },
        { header: "Cần phải thu", key: "remaining", width: 15 },
        { header: "Nhà phân phối", key: "funnel", width: 25 },
        { header: "Kiểu vận chuyển", key: "shippingType", width: 20 },
        { header: "Xưởng", key: "factory", width: 20 },
        { header: "", key: "empty", width: 5 },
        { header: "Nguồn gốc", key: "source", width: 20 },
        { header: "Kho xuất hàng", key: "storage", width: 20 }
      ]

      // Add data rows
      rows.forEach((row) => {
        worksheet.addRow(row)
      })

      // Apply Times New Roman font to all cells
      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.font = { name: "Times New Roman", size: 11 }
          cell.alignment = { vertical: "middle", horizontal: "left" }
        })
      })

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer()
      return Buffer.from(buffer)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi export đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private formatDate(date: Date): string {
    const d = new Date(date)
    const day = String(d.getDate()).padStart(2, "0")
    const month = String(d.getMonth() + 1).padStart(2, "0")
    const year = d.getFullYear()
    return `${day}/${month}/${year}`
  }

  private getShippingTypeLabel(shippingType?: SalesOrderShippingType): string {
    if (!shippingType) return ""
    const types: Record<SalesOrderShippingType, string> = {
      shipping_vtp: "VIETTEL POST",
      shipping_cargo: "SHIPCODE LÊN CHÀNH"
    }
    return types[shippingType] || ""
  }

  private getStorageLabel(storage: SalesOrderStorage): string {
    const storages: Record<SalesOrderStorage, string> = {
      position_HaNam: "Kho Hà Nam",
      position_MKT: "Kho MKT"
    }
    return storages[storage] || storage
  }

  private getFactoryLabel(factory: string): string {
    const factories: Record<string, string> = {
      candy: "Xưởng kẹo mút",
      jelly: "Xưởng thạch",
      import: "Hàng nhập khẩu",
      manufacturing: "Xưởng gia công",
      position_MongCai: "Móng Cái"
    }
    return factories[factory] || factory
  }

  private getSourceLabel(source: string): string {
    const sources: Record<string, string> = {
      inside: "Hàng trong nhà máy",
      outside: "Hàng ngoài nhà máy"
    }
    return sources[source] || source
  }
}
