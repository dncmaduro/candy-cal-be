import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import * as XLSX from "xlsx"
import * as ExcelJS from "exceljs"
import {
  SalesOrder,
  SalesOrderShippingType,
  SalesOrderStorage,
  SalesOrderStatus
} from "../database/mongoose/schemas/SalesOrder"
import { SalesItem } from "../database/mongoose/schemas/SalesItem"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"
import { Province } from "../database/mongoose/schemas/Province"

interface XlsxSalesOrderData {
  "SĐT Khách hàng"?: string
  "Mã sản phẩm"?: string
  "Số lượng"?: number
  Kho?: string
  Ngày?: string
  "Giảm giá đơn hàng"?: number
  "Giảm giá khác"?: number
  "Đặt cọc"?: number
  Thuế?: number
  "Phí ship"?: number
  "Mã vận đơn"?: string
  "Loại vận chuyển"?: string
}

@Injectable()
export class SalesOrdersService {
  constructor(
    @InjectModel("salesorders")
    private readonly salesOrderModel: Model<SalesOrder>,
    @InjectModel("salesitems")
    private readonly salesItemModel: Model<SalesItem>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>,
    @InjectModel("provinces")
    private readonly provinceModel: Model<Province>
  ) {}

  async createOrder(payload: {
    salesFunnelId: string
    items: { code: string; quantity: number; note?: string }[]
    storage: SalesOrderStorage
    date: Date
    orderDiscount?: number
    otherDiscount?: number
    deposit?: number
    note?: string
  }): Promise<SalesOrder> {
    try {
      // Get sales funnel with channel populated
      const funnel = await this.salesFunnelModel
        .findById(payload.salesFunnelId)
        .populate("channel")
        .exec()
      if (!funnel) {
        throw new HttpException("Sales funnel not found", HttpStatus.NOT_FOUND)
      }

      // Get phone number from channel
      const thisFunnel = await this.salesFunnelModel
        .findById(payload.salesFunnelId)
        .populate("channel")
        .lean()
      const phoneNumber = (thisFunnel.channel as any)?.phoneNumber || ""

      // Get funnel address and province
      const address = funnel.address || ""
      const province = await this.provinceModel.findById(funnel.province).lean()

      // Determine returning based on hasBuyed
      const returning = funnel.hasBuyed

      // Build sales items with all details from SalesItem
      const itemsWithDetails = await Promise.all(
        payload.items.map(async (item) => {
          // Get sales item for all details
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
            quantity: item.quantity,
            area: salesItem.area,
            mass: salesItem.mass,
            specification: salesItem.specification?.toString(),
            size: salesItem.size,
            note: item.note
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
        total,
        orderDiscount: payload.orderDiscount || 0,
        otherDiscount: payload.otherDiscount || 0,
        deposit: payload.deposit || 0,
        phoneNumber,
        address,
        province: province
          ? { id: province._id.toString(), name: province.name }
          : undefined
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

  async uploadSalesOrders(file: Express.Multer.File): Promise<{
    success: true
    inserted: number
    warnings?: string[]
    totalWarnings?: number
  }> {
    try {
      // Read Excel file
      const workbook = XLSX.read(file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet) as XlsxSalesOrderData[]

      if (!data || data.length === 0) {
        throw new HttpException(
          "File trống hoặc không hợp lệ",
          HttpStatus.BAD_REQUEST
        )
      }

      let inserted = 0
      const errors: string[] = []

      // Pre-fetch all funnels (with channel) and items for mapping
      const [funnels, items] = await Promise.all([
        this.salesFunnelModel.find().populate("channel").lean(),
        this.salesItemModel.find().lean()
      ])

      // Group rows by customer phone number to create orders with multiple items
      const ordersByPhone = new Map<string, XlsxSalesOrderData[]>()

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const phoneNumber = row["SĐT Khách hàng"]
          ? row["SĐT Khách hàng"].toString().trim()
          : ""

        if (!phoneNumber) {
          errors.push(`Dòng ${i + 2}: Thiếu số điện thoại khách hàng`)
          continue
        }

        if (!ordersByPhone.has(phoneNumber)) {
          ordersByPhone.set(phoneNumber, [])
        }
        ordersByPhone.get(phoneNumber)!.push(row)
      }

      // Process each order
      for (const [phoneNumber, rows] of ordersByPhone.entries()) {
        try {
          // Find funnel by phone number
          const funnel = funnels.find(
            (f) =>
              f.phoneNumber === phoneNumber ||
              f.secondaryPhoneNumbers?.includes(phoneNumber)
          )

          if (!funnel) {
            errors.push(
              `Số điện thoại "${phoneNumber}": Không tìm thấy khách hàng`
            )
            continue
          }

          // Get phone number from channel
          const channel = funnel.channel as any
          const channelPhoneNumber = channel?.phoneNumber || ""

          // Get order details from first row (assuming all rows for same phone have same order details)
          const firstRow = rows[0]
          const storageValue = firstRow["Kho"]
            ? firstRow["Kho"].toString().trim().toLowerCase()
            : ""
          const dateValue = firstRow["Ngày"]
            ? firstRow["Ngày"].toString().trim()
            : ""
          const orderDiscount = firstRow["Giảm giá đơn hàng"]
            ? Number(firstRow["Giảm giá đơn hàng"])
            : 0
          const otherDiscount = firstRow["Giảm giá khác"]
            ? Number(firstRow["Giảm giá khác"])
            : 0
          const deposit = firstRow["Đặt cọc"] ? Number(firstRow["Đặt cọc"]) : 0
          const tax = firstRow["Thuế"] ? Number(firstRow["Thuế"]) : 0
          const shippingCost = firstRow["Phí ship"]
            ? Number(firstRow["Phí ship"])
            : 0
          const shippingCode = firstRow["Mã vận đơn"]
            ? firstRow["Mã vận đơn"].toString().trim()
            : undefined
          const shippingTypeValue = firstRow["Loại vận chuyển"]
            ? firstRow["Loại vận chuyển"].toString().trim().toLowerCase()
            : ""

          // Validate and map storage
          let storage: SalesOrderStorage = "position_HaNam"
          if (
            storageValue.includes("hà nam") ||
            storageValue.includes("ha nam")
          ) {
            storage = "position_HaNam"
          } else if (
            storageValue.includes("mkt") ||
            storageValue.includes("marketing")
          ) {
            storage = "position_MKT"
          } else if (storageValue) {
            errors.push(
              `Số điện thoại "${phoneNumber}": Kho "${storageValue}" không hợp lệ, sử dụng mặc định "Hà Nam"`
            )
          }

          // Validate and map shipping type
          let shippingType: SalesOrderShippingType | undefined
          if (
            shippingTypeValue.includes("vtp") ||
            shippingTypeValue.includes("viettel")
          ) {
            shippingType = "shipping_vtp"
          } else if (
            shippingTypeValue.includes("cargo") ||
            shippingTypeValue.includes("chành")
          ) {
            shippingType = "shipping_cargo"
          }

          // Parse date
          let date = new Date()
          if (dateValue) {
            const parsedDate = new Date(dateValue)
            if (!isNaN(parsedDate.getTime())) {
              date = parsedDate
            } else {
              errors.push(
                `Số điện thoại "${phoneNumber}": Ngày không hợp lệ, sử dụng ngày hiện tại`
              )
            }
          }

          // Build items array
          const orderItems: {
            code: string
            name: string
            price: number
            quantity: number
            area?: number
            mass?: number
            specification?: string
            size?: string
          }[] = []
          let hasItemErrors = false

          for (let i = 0; i < rows.length; i++) {
            const row = rows[i]
            const rowNumber = data.indexOf(row) + 2
            const code = row["Mã sản phẩm"]
              ? row["Mã sản phẩm"].toString().trim()
              : ""
            const quantity = row["Số lượng"] ? Number(row["Số lượng"]) : 0

            if (!code) {
              errors.push(`Dòng ${rowNumber}: Thiếu mã sản phẩm`)
              hasItemErrors = true
              continue
            }

            if (!quantity || quantity <= 0) {
              errors.push(`Dòng ${rowNumber}: Số lượng không hợp lệ`)
              hasItemErrors = true
              continue
            }

            // Find item
            const item = items.find((it) => it.code === code)
            if (!item) {
              errors.push(
                `Dòng ${rowNumber}: Không tìm thấy sản phẩm với mã "${code}"`
              )
              hasItemErrors = true
              continue
            }

            orderItems.push({
              code: item.code,
              name: item.name.vn,
              price: item.price,
              quantity,
              area: item.area,
              mass: item.mass,
              specification: item.specification?.toString(),
              size: item.size
            })
          }

          if (hasItemErrors || orderItems.length === 0) {
            continue
          }

          // Calculate total
          const total = orderItems.reduce(
            (sum, item) => sum + item.price * item.quantity,
            0
          )

          // Determine returning status
          const returning = funnel.hasBuyed || false

          // Create order
          await this.salesOrderModel.create({
            salesFunnelId: new Types.ObjectId(funnel._id.toString()),
            items: orderItems,
            returning,
            storage,
            date,
            total,
            orderDiscount,
            otherDiscount,
            deposit,
            tax,
            shippingCost,
            shippingCode,
            shippingType,
            phoneNumber: channelPhoneNumber,
            status: "official",
            createdAt: new Date(),
            updatedAt: new Date()
          })

          // Update hasBuyed to true if it was false
          if (!funnel.hasBuyed) {
            await this.salesFunnelModel.findByIdAndUpdate(funnel._id, {
              hasBuyed: true
            })
          }

          inserted++
        } catch (error) {
          errors.push(`Số điện thoại "${phoneNumber}": ${error.message}`)
        }
      }

      // Return success with warnings if any
      return {
        success: true,
        inserted,
        ...(errors.length > 0 && {
          warnings: errors.slice(0, 20), // Show first 20 warnings
          totalWarnings: errors.length
        })
      } as any
    } catch (error) {
      console.error("Error in uploadSalesOrders:", error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Có lỗi khi xử lý file Excel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Generate Excel template for sales orders upload
   */
  async generateUploadTemplate(): Promise<Buffer> {
    const workbook = XLSX.utils.book_new()

    // Define headers
    const headers = [
      "SĐT Khách hàng",
      "Mã sản phẩm",
      "Số lượng",
      "Kho",
      "Ngày",
      "Giảm giá đơn hàng",
      "Giảm giá khác",
      "Đặt cọc",
      "Thuế",
      "Phí ship",
      "Mã vận đơn",
      "Loại vận chuyển"
    ]

    // Define sample data rows
    const sampleData = [
      [
        "0123456789",
        "SP001",
        10,
        "Kho Hà Nội",
        "2024-01-01",
        0,
        0,
        0,
        0,
        30000,
        "VTP123456",
        "VTP"
      ],
      [
        "0123456789",
        "SP002",
        5,
        "Kho Hà Nội",
        "2024-01-01",
        0,
        0,
        0,
        0,
        30000,
        "VTP123456",
        "VTP"
      ],
      [
        "0987654321",
        "SP003",
        20,
        "Kho MKT",
        "2024-01-15",
        5000,
        2000,
        100000,
        10000,
        50000,
        "CARGO789",
        "Cargo"
      ]
    ]

    // Combine headers and sample data
    const data = [headers, ...sampleData]

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data)

    // Set column widths for better readability
    worksheet["!cols"] = [
      { wch: 18 }, // SĐT Khách hàng
      { wch: 15 }, // Mã sản phẩm
      { wch: 12 }, // Số lượng
      { wch: 12 }, // Kho
      { wch: 15 }, // Ngày
      { wch: 18 }, // Giảm giá đơn hàng
      { wch: 15 }, // Giảm giá khác
      { wch: 12 }, // Đặt cọc
      { wch: 12 }, // Thuế
      { wch: 12 }, // Phí ship
      { wch: 15 }, // Mã vận đơn
      { wch: 18 } // Loại vận chuyển
    ]

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Orders")

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

    return buffer
  }

  async updateOrderItems(
    orderId: string,
    items: {
      code: string
      quantity: number
      note?: string
    }[],
    storage?: SalesOrderStorage,
    orderDiscount?: number,
    otherDiscount?: number,
    deposit?: number
  ): Promise<SalesOrder> {
    try {
      const order = await this.salesOrderModel
        .findById(orderId)
        .populate({
          path: "salesFunnelId",
          populate: {
            path: "channel",
            model: "saleschannels"
          }
        })
        .exec()
      if (!order) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }

      // Get phone number from channel
      const funnel = await this.salesFunnelModel
        .findById(order.salesFunnelId)
        .populate("channel")
        .lean()
      const phoneNumber =
        (funnel.channel as any)?.phoneNumber || order.phoneNumber || ""

      // Get address and province from funnel
      const address = funnel.address || ""
      const province = await this.provinceModel.findById(funnel.province).lean()

      // Build sales items with all details from SalesItem
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

          return {
            code: item.code,
            name: salesItem.name.vn, // Use Vietnamese name
            price: salesItem.price,
            quantity: item.quantity,
            area: salesItem.area,
            mass: salesItem.mass,
            specification: salesItem.specification?.toString(),
            size: salesItem.size,
            note: item.note
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
      order.phoneNumber = phoneNumber
      order.address = address
      order.province = province
        ? { id: province._id.toString(), name: province.name }
        : undefined
      if (storage !== undefined) {
        order.storage = storage
      }
      if (orderDiscount !== undefined) {
        order.orderDiscount = orderDiscount
      }
      if (otherDiscount !== undefined) {
        order.otherDiscount = otherDiscount
      }
      if (deposit !== undefined) {
        order.deposit = deposit
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
      const funnel = await this.salesFunnelModel.findById(order.salesFunnelId)
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
      if (remainingCount === 0 && !funnel.fromSystem) {
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

  async updateShippingAndTax(
    orderId: string,
    payload: {
      shippingCode?: string
      shippingType?: SalesOrderShippingType
      tax?: number
      shippingCost?: number
      receivedDate?: Date
    }
  ): Promise<SalesOrder> {
    try {
      const order = await this.salesOrderModel.findById(orderId)
      if (!order) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }

      if (payload.shippingCode !== undefined) {
        order.shippingCode = payload.shippingCode
      }
      if (payload.shippingType !== undefined) {
        order.shippingType = payload.shippingType
      }
      if (payload.tax !== undefined) {
        order.tax = payload.tax
      }
      if (payload.shippingCost !== undefined) {
        order.shippingCost = payload.shippingCost
      }
      if (payload.receivedDate !== undefined) {
        order.receivedDate = payload.receivedDate
      }

      order.updatedAt = new Date()

      return await order.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật thông tin vận chuyển và thuế",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getOrdersByFunnel(
    funnelId: string,
    userId: string,
    isAdmin: boolean,
    page = 1,
    limit = 10
  ): Promise<{
    data: SalesOrder[]
    total: number
    daysSinceLastPurchase: number | null
  }> {
    try {
      // Check if funnel exists and get ownership
      const funnel = await this.salesFunnelModel.findById(funnelId).lean()
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check permission: only admin or responsible user can view
      if (!isAdmin && funnel.user.toString() !== userId) {
        throw new HttpException(
          "Bạn không có quyền xem đơn hàng của funnel này",
          HttpStatus.FORBIDDEN
        )
      }

      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter = { salesFunnelId: new Types.ObjectId(funnelId) }

      // Get the most recent order to calculate days since last purchase
      const lastOrder = await this.salesOrderModel
        .findOne(filter)
        .sort({ date: -1 })
        .lean()

      let daysSinceLastPurchase: number | null = null
      if (lastOrder && lastOrder.date) {
        const now = new Date()
        const lastPurchaseDate = new Date(lastOrder.date)
        const diffTime = Math.abs(now.getTime() - lastPurchaseDate.getTime())
        daysSinceLastPurchase = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      }

      const [orders, total] = await Promise.all([
        this.salesOrderModel
          .find(filter)
          .populate({
            path: "salesFunnelId",
            populate: [
              { path: "channel", model: "saleschannels" },
              { path: "user", model: "users", select: "name email role" },
              { path: "province", model: "provinces" }
            ]
          })
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
            order.items.map(async (item: any) => {
              const salesItem = await this.salesItemModel
                .findOne({ code: item.code })
                .lean()

              return {
                ...item,
                factory: salesItem?.factory,
                source: salesItem?.source,
                massPerBox: item.massPerBox,
                areaPerBox: item.areaPerBox
              }
            })
          )

          return {
            ...order,
            items: enrichedItems
          }
        })
      )

      return {
        data: enrichedOrders as SalesOrder[],
        total,
        daysSinceLastPurchase
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy danh sách đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchOrders(
    filters: {
      salesFunnelId?: string
      userId?: string
      channelId?: string
      returning?: boolean
      startDate?: Date
      endDate?: Date
      searchText?: string
      shippingType?: SalesOrderShippingType
      status?: SalesOrderStatus
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
      if (filters.status) filter.status = filters.status

      // Filter by channel (funnel channel)
      if (filters.channelId) {
        const funnelIds = await this.salesFunnelModel
          .find({ channel: new Types.ObjectId(filters.channelId) })
          .distinct("_id")
        filter.salesFunnelId = { $in: funnelIds }
      }

      // Filter by user (funnel responsible)
      if (filters.userId) {
        const funnelIds = await this.salesFunnelModel
          .find({ user: new Types.ObjectId(filters.userId) })
          .distinct("_id")
        filter.salesFunnelId = { $in: funnelIds }
      }

      if (filters.startDate || filters.endDate) {
        filter.date = {}
        if (filters.startDate) {
          const startDate = new Date(filters.startDate)
          startDate.setUTCHours(startDate.getUTCHours() - 7)
          filter.date.$gte = startDate
        }
        if (filters.endDate) {
          const endDate = new Date(filters.endDate)
          endDate.setUTCHours(endDate.getUTCHours() - 7)
          filter.date.$lte = endDate
        }
      }

      // Handle search text - search by funnel name, phone number, shipping code, item code, item name
      if (filters.searchText && filters.searchText.trim().length > 0) {
        const searchText = filters.searchText.trim()

        // First, find funnels matching name or phone number
        const matchingFunnels = await this.salesFunnelModel
          .find({
            $or: [
              { name: { $regex: `.*${searchText}.*`, $options: "i" } },
              { phoneNumber: { $regex: `.*${searchText}.*`, $options: "i" } },
              {
                secondaryPhoneNumbers: {
                  $regex: `.*${searchText}.*`,
                  $options: "i"
                }
              }
            ]
          })
          .distinct("_id")

        const searchRegex = {
          $regex: `.*${searchText}.*`,
          $options: "i"
        }

        filter.$or = [
          { shippingCode: searchRegex },
          { "items.code": searchRegex },
          { "items.name": searchRegex },
          { salesFunnelId: { $in: matchingFunnels } }
        ]
      }

      const [orders, total] = await Promise.all([
        this.salesOrderModel
          .find(filter)
          .populate({
            path: "salesFunnelId",
            populate: [
              { path: "channel", model: "saleschannels" },
              { path: "user", model: "users", select: "name email role" },
              { path: "province", model: "provinces" }
            ]
          })
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
            order.items.map(async (item: any) => {
              const salesItem = await this.salesItemModel
                .findOne({ code: item.code })
                .lean()

              return {
                ...item,
                factory: salesItem?.factory,
                source: salesItem?.source,
                massPerBox: item.massPerBox,
                areaPerBox: item.areaPerBox
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
        .populate({
          path: "salesFunnelId",
          populate: [
            { path: "channel", model: "saleschannels" },
            { path: "user", model: "users", select: "name email role" },
            { path: "province", model: "provinces" }
          ]
        })
        .lean()

      if (!order) {
        return null
      }

      // Enrich items with factory and source information
      const enrichedItems = await Promise.all(
        order.items.map(async (item: any) => {
          const salesItem = await this.salesItemModel
            .findOne({ code: item.code })
            .lean()

          return {
            ...item,
            factory: salesItem?.factory,
            source: salesItem?.source,
            massPerBox: item.massPerBox,
            areaPerBox: item.areaPerBox
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

  // async exportOrdersToExcel(filters: {
  //   salesFunnelId?: string
  //   userId?: string
  //   channelId?: string
  //   returning?: boolean
  //   startDate?: Date
  //   endDate?: Date
  //   searchText?: string
  //   shippingType?: SalesOrderShippingType
  //   status?: SalesOrderStatus
  // }): Promise<Buffer> {
  //   try {
  //     // Build filter (same as searchOrders but without pagination)
  //     const filter: any = {}
  //     if (filters.salesFunnelId)
  //       filter.salesFunnelId = new Types.ObjectId(filters.salesFunnelId)
  //     if (filters.returning !== undefined) filter.returning = filters.returning
  //     if (filters.shippingType) filter.shippingType = filters.shippingType
  //     if (filters.status) filter.status = filters.status

  //     // Filter by channel (funnel channel)
  //     if (filters.channelId) {
  //       const funnelIds = await this.salesFunnelModel
  //         .find({ channel: new Types.ObjectId(filters.channelId) })
  //         .distinct("_id")
  //       filter.salesFunnelId = { $in: funnelIds }
  //     }

  //     // Filter by user (funnel responsible)
  //     if (filters.userId) {
  //       const funnelIds = await this.salesFunnelModel
  //         .find({ user: new Types.ObjectId(filters.userId) })
  //         .distinct("_id")
  //       filter.salesFunnelId = { $in: funnelIds }
  //     }

  //     if (filters.startDate || filters.endDate) {
  //       filter.date = {}
  //       // minus startDate 7 hours
  //       if (filters.startDate) {
  //         const startDate = new Date(filters.startDate)
  //         startDate.setUTCHours(startDate.getUTCHours() - 7)
  //         filter.date.$gte = startDate
  //       }
  //       // minus endDate 7 hours
  //       if (filters.endDate) {
  //         const endDate = new Date(filters.endDate)
  //         endDate.setUTCHours(endDate.getUTCHours() - 7)
  //         filter.date.$lte = endDate
  //       }
  //     }

  //     if (filters.searchText && filters.searchText.trim().length > 0) {
  //       const searchText = filters.searchText.trim()

  //       // First, find funnels matching name or phone number
  //       const matchingFunnels = await this.salesFunnelModel
  //         .find({
  //           $or: [
  //             { name: { $regex: `.*${searchText}.*`, $options: "i" } },
  //             { phoneNumber: { $regex: `.*${searchText}.*`, $options: "i" } },
  //             {
  //               secondaryPhoneNumbers: {
  //                 $regex: `.*${searchText}.*`,
  //                 $options: "i"
  //               }
  //             }
  //           ]
  //         })
  //         .distinct("_id")

  //       const searchRegex = {
  //         $regex: `.*${searchText}.*`,
  //         $options: "i"
  //       }

  //       filter.$or = [
  //         { shippingCode: searchRegex },
  //         { "items.code": searchRegex },
  //         { "items.name": searchRegex },
  //         { salesFunnelId: { $in: matchingFunnels } }
  //       ]
  //     }

  //     // Get all orders matching filter
  //     const orders = await this.salesOrderModel
  //       .find(filter)
  //       .populate({
  //         path: "salesFunnelId",
  //         populate: [
  //           { path: "channel", model: "saleschannels" },
  //           { path: "user", model: "users", select: "name email role" },
  //           { path: "province", model: "provinces" }
  //         ]
  //       })
  //       .sort({ createdAt: -1 })
  //       .lean()

  //     // Separate orders by shipping type and sort by date
  //     const cargoOrders = orders
  //       .filter((o) => o.shippingType === "shipping_cargo")
  //       .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  //     const vtpOrders = orders
  //       .filter((o) => o.shippingType === "shipping_vtp")
  //       .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  //     const otherOrders = orders
  //       .filter(
  //         (o) =>
  //           !o.shippingType ||
  //           (o.shippingType !== "shipping_cargo" &&
  //             o.shippingType !== "shipping_vtp")
  //       )
  //       .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  //     // Create workbook using ExcelJS
  //     const workbook = new ExcelJS.Workbook()
  //     const worksheet = workbook.addWorksheet("Orders")

  //     // Define column widths (in pixels / 7 to approximate character width)
  //     const columnWidths = [
  //       88, 376, 140, 336, 104, 105, 105, 78, 97, 105, 105, 159, 247, 210, 160,
  //       123, 118, 147
  //     ]
  //     worksheet.columns = columnWidths.map((width, idx) => ({
  //       key: `col${idx + 1}`,
  //       width: width / 7
  //     }))

  //     // Define headers
  //     const headers = [
  //       "Ngày",
  //       "客户（省份）NPP",
  //       "Mã",
  //       "Sản phẩm",
  //       "Số lượng",
  //       "Giá bán - 外部价格",
  //       "Thành tiền 销售金额",
  //       "Thuế 0.75%",
  //       "Tiền ship",
  //       "Khách trả tiền xe trước - 客户先付运费",
  //       "Thu tiền",
  //       "Còn phải thu",
  //       "备注 NPP",
  //       "Ngày thu tiền",
  //       "Nguồn gốc",
  //       "Kho xuất hàng",
  //       "Mã vận đơn",
  //       ""
  //     ]

  //     // Add header row
  //     const headerRow = worksheet.addRow(headers)
  //     headerRow.height = 71
  //     headerRow.font = {
  //       name: "Times New Roman",
  //       size: 12,
  //       bold: true,
  //       color: { argb: "FFFF0000" }
  //     }
  //     headerRow.fill = {
  //       type: "pattern",
  //       pattern: "solid",
  //       fgColor: { argb: "FFFFFF04" }
  //     }
  //     headerRow.alignment = {
  //       vertical: "middle",
  //       horizontal: "center",
  //       wrapText: true
  //     }

  //     // Add borders to header
  //     headerRow.eachCell((cell) => {
  //       cell.border = {
  //         top: { style: "thin", color: { argb: "FF000000" } },
  //         left: { style: "thin", color: { argb: "FF000000" } },
  //         bottom: { style: "thin", color: { argb: "FF000000" } },
  //         right: { style: "thin", color: { argb: "FF000000" } }
  //       }
  //     })

  //     let currentRow = 2

  //     // Helper function to format number with thousands separator
  //     const formatNumber = (num: number): string => {
  //       return num.toLocaleString("vi-VN")
  //     }

  //     // Helper function to format date
  //     const formatDateExtended = (date: Date): string => {
  //       if (!date) return ""
  //       const d = new Date(date)
  //       // Add 7 hours
  //       d.setUTCHours(d.getUTCHours() + 7)
  //       const day = d.getDate()
  //       const month = d.getMonth() + 1
  //       const year = d.getFullYear()
  //       return `${day}/${month}/${year}`
  //     }

  //     // Track totals for each section
  //     let cargoTotals = {
  //       quantity: 0,
  //       thanhTien: 0,
  //       tax: 0,
  //       shipping: 0,
  //       prepaid: 0,
  //       collected: 0
  //     }

  //     let vtpTotals = {
  //       quantity: 0,
  //       thanhTien: 0,
  //       tax: 0,
  //       shipping: 0,
  //       prepaid: 0,
  //       collected: 0
  //     }

  //     let otherTotals = {
  //       quantity: 0,
  //       thanhTien: 0,
  //       tax: 0,
  //       shipping: 0,
  //       prepaid: 0,
  //       collected: 0
  //     }

  //     // Helper function to add order rows
  //     const addOrderRows = (
  //       order: any,
  //       totals: any,
  //       isVTP: boolean = false
  //     ) => {
  //       const funnel = order.salesFunnelId as any
  //       const funnelName = funnel?.name || ""
  //       let provinceName = funnel?.province?.name || ""

  //       // Remove "Tỉnh" or "Thành phố" prefix from province name
  //       provinceName = provinceName.replace(/^(Tỉnh|Thành phố)\s+/i, "")

  //       // Customer info based on shipping type
  //       let customerInfo = ""
  //       if (order.shippingType === "shipping_vtp") {
  //         customerInfo = `Shipcod (${funnelName} - ${provinceName})`
  //       } else if (order.shippingType === "shipping_cargo") {
  //         customerInfo = `Chành (${funnelName} - ${provinceName})`
  //       } else {
  //         customerInfo = `${funnelName} - ${provinceName}`
  //       }

  //       // Shipping type label
  //       const shippingTypeLabel =
  //         order.shippingType === "shipping_vtp"
  //           ? "VIETTEL POST"
  //           : order.shippingType === "shipping_cargo"
  //             ? "SHIPCOD LÊN CHÀNH"
  //             : "KHÁC"

  //       // Calculate tax (only for VTP)
  //       const taxValue =
  //         order.shippingType === "shipping_vtp"
  //           ? Math.round(order.total * 0.0075)
  //           : 0

  //       // Build array of prepaid values (only non-zero values)
  //       const prepaidValues: number[] = []
  //       if (order.orderDiscount && order.orderDiscount > 0) {
  //         prepaidValues.push(order.orderDiscount)
  //       }
  //       if (order.otherDiscount && order.otherDiscount > 0) {
  //         prepaidValues.push(order.otherDiscount)
  //       }
  //       if (order.deposit && order.deposit > 0) {
  //         prepaidValues.push(order.deposit)
  //       }

  //       // Calculate total rows needed (max of items count and prepaid values count)
  //       const totalRowsNeeded = Math.max(
  //         order.items.length,
  //         prepaidValues.length
  //       )

  //       for (let i = 0; i < totalRowsNeeded; i++) {
  //         const item = i < order.items.length ? order.items[i] : null
  //         const thanhTien = item ? item.price * item.quantity : 0

  //         // Calculate "Thu tiền" for this item
  //         const taxForRow = i === 0 ? taxValue : 0
  //         const shippingForRow = i === 0 ? order.shippingCost || 0 : 0
  //         const prepaidForRow = i < prepaidValues.length ? prepaidValues[i] : 0

  //         // If there's an item, calculate normally
  //         // If no item but has prepaid value, show negative prepaid value
  //         const thuTien = item
  //           ? Math.round(thanhTien + taxForRow + shippingForRow - prepaidForRow)
  //           : prepaidForRow > 0
  //             ? -prepaidForRow
  //             : 0

  //         const row = worksheet.addRow([
  //           formatDateExtended(order.date), // Always show date
  //           customerInfo, // Always show NPP
  //           item ? item.code : "",
  //           item ? item.name : "",
  //           item ? item.quantity : "",
  //           item ? item.price : "", // Number format
  //           item ? thanhTien : "", // Number format
  //           i === 0 && order.shippingType === "shipping_vtp" ? taxValue : "",
  //           i === 0 ? order.shippingCost || 0 : "",
  //           prepaidForRow || "",
  //           thuTien || "", // Number format (can be negative)
  //           "",
  //           shippingTypeLabel, // Always show shipping type label
  //           i === 0 ? formatDateExtended(order.receivedDate) : "",
  //           "",
  //           "",
  //           order.shippingCode || "", // Always show shipping code
  //           ""
  //         ])

  //         // Set row height
  //         row.height = 27

  //         // Apply Times New Roman font size 12
  //         row.font = { name: "Times New Roman", size: 12 }
  //         row.alignment = {
  //           vertical: "middle",
  //           horizontal: "left",
  //           wrapText: true
  //         }

  //         // Ngày - right align
  //         row.getCell(1).alignment = {
  //           vertical: "middle",
  //           horizontal: "right",
  //           wrapText: true
  //         }

  //         // 客户（省份）NPP - center, red, bold
  //         row.getCell(2).alignment = {
  //           vertical: "middle",
  //           horizontal: "center",
  //           wrapText: true
  //         }
  //         row.getCell(2).font = {
  //           name: "Times New Roman",
  //           size: 12,
  //           bold: true,
  //           color: { argb: "FFFF0000" }
  //         }

  //         // Mã - left align
  //         row.getCell(3).alignment = {
  //           vertical: "middle",
  //           horizontal: "left",
  //           wrapText: true
  //         }

  //         // Sản phẩm - left align
  //         row.getCell(4).alignment = {
  //           vertical: "middle",
  //           horizontal: "left",
  //           wrapText: true
  //         }

  //         // Giá bán - right align, number format
  //         if (item) {
  //           row.getCell(6).alignment = {
  //             vertical: "middle",
  //             horizontal: "right",
  //             wrapText: true
  //           }
  //           row.getCell(6).numFmt = "#,##0"
  //         }

  //         // Thành tiền - right align, number format
  //         if (item) {
  //           row.getCell(7).alignment = {
  //             vertical: "middle",
  //             horizontal: "right",
  //             wrapText: true
  //           }
  //           row.getCell(7).numFmt = "#,##0"
  //         }

  //         // Thuế - number format
  //         if (i === 0 && order.shippingType === "shipping_vtp") {
  //           row.getCell(8).numFmt = "#,##0"
  //         }

  //         // Tiền ship - number format
  //         if (i === 0) {
  //           row.getCell(9).numFmt = "#,##0"
  //         }

  //         // Khách trả tiền xe trước - number format
  //         if (prepaidForRow > 0) {
  //           row.getCell(10).numFmt = "#,##0"
  //         }

  //         // Thu tiền - number format
  //         if (item || prepaidForRow > 0) {
  //           row.getCell(11).numFmt = "#,##0"
  //         }

  //         // 备注 NPP (shippingType) - beige background
  //         row.getCell(13).fill = {
  //           type: "pattern",
  //           pattern: "solid",
  //           fgColor: { argb: "FFFEF2C9" }
  //         }

  //         // Add borders to cells within the table (columns 1-17 only)
  //         for (let colNum = 1; colNum <= 17; colNum++) {
  //           row.getCell(colNum).border = {
  //             top: { style: "thin", color: { argb: "FF000000" } },
  //             left: { style: "thin", color: { argb: "FF000000" } },
  //             bottom: { style: "thin", color: { argb: "FF000000" } },
  //             right: { style: "thin", color: { argb: "FF000000" } }
  //           }
  //         }

  //         currentRow++
  //       }

  //       // Update totals
  //       totals.quantity += order.items.reduce(
  //         (sum: number, item: any) => sum + item.quantity,
  //         0
  //       )
  //       totals.thanhTien += order.total
  //       totals.tax += taxValue
  //       totals.shipping += order.shippingCost || 0
  //       totals.prepaid +=
  //         (order.orderDiscount || 0) +
  //         (order.otherDiscount || 0) +
  //         (order.deposit || 0)
  //       totals.collected +=
  //         order.total +
  //         taxValue +
  //         (order.shippingCost || 0) -
  //         (order.orderDiscount || 0) -
  //         (order.otherDiscount || 0) -
  //         (order.deposit || 0)

  //       // Add separator row (beige) - always for cargo, only between dates for VTP
  //       const separatorRow = worksheet.addRow(Array(18).fill(""))
  //       separatorRow.height = 27
  //       // Only apply fill and borders to cells within the table (columns 1-17)
  //       for (let colNum = 1; colNum <= 17; colNum++) {
  //         separatorRow.getCell(colNum).fill = {
  //           type: "pattern",
  //           pattern: "solid",
  //           fgColor: { argb: "FFFEF2C9" }
  //         }
  //         separatorRow.getCell(colNum).border = {
  //           top: { style: "thin", color: { argb: "FF000000" } },
  //           left: { style: "thin", color: { argb: "FF000000" } },
  //           bottom: { style: "thin", color: { argb: "FF000000" } },
  //           right: { style: "thin", color: { argb: "FF000000" } }
  //         }
  //       }
  //       currentRow++
  //     }

  //     // Add cargo orders (always separate each order)
  //     cargoOrders.forEach((order) => addOrderRows(order, cargoTotals, false))

  //     // Add summary row for cargo immediately after cargo orders
  //     if (cargoOrders.length > 0) {
  //       const cargoSummaryRow = worksheet.addRow([
  //         "Ngày",
  //         "",
  //         "",
  //         "",
  //         cargoTotals.quantity, // Number format
  //         "",
  //         cargoTotals.thanhTien, // Number format
  //         Math.round(cargoTotals.tax), // Number format
  //         cargoTotals.shipping, // Number format
  //         cargoTotals.prepaid, // Number format
  //         Math.round(cargoTotals.collected), // Number format
  //         "",
  //         "",
  //         "",
  //         "",
  //         "",
  //         "",
  //         ""
  //       ])

  //       cargoSummaryRow.height = 42

  //       // Merge cells for "TỔNG CỘNG ĐI CHÀNH"
  //       worksheet.mergeCells(currentRow, 2, currentRow, 4)
  //       worksheet.getCell(currentRow, 2).value = "TỔNG CỘNG ĐI CHÀNH"

  //       cargoSummaryRow.font = {
  //         name: "Times New Roman",
  //         size: 12,
  //         bold: true,
  //         color: { argb: "FFFF0000" }
  //       }
  //       cargoSummaryRow.fill = {
  //         type: "pattern",
  //         pattern: "solid",
  //         fgColor: { argb: "FFA8E9E3" }
  //       }
  //       cargoSummaryRow.alignment = { vertical: "middle", horizontal: "center" }

  //       // Apply number format to summary cells
  //       cargoSummaryRow.getCell(5).numFmt = "#,##0"
  //       cargoSummaryRow.getCell(7).numFmt = "#,##0"
  //       cargoSummaryRow.getCell(8).numFmt = "#,##0"
  //       cargoSummaryRow.getCell(9).numFmt = "#,##0"
  //       cargoSummaryRow.getCell(10).numFmt = "#,##0"
  //       cargoSummaryRow.getCell(11).numFmt = "#,##0"

  //       // Add borders to summary row (only columns 1-17)
  //       for (let colNum = 1; colNum <= 17; colNum++) {
  //         cargoSummaryRow.getCell(colNum).border = {
  //           top: { style: "thin", color: { argb: "FF000000" } },
  //           left: { style: "thin", color: { argb: "FF000000" } },
  //           bottom: { style: "thin", color: { argb: "FF000000" } },
  //           right: { style: "thin", color: { argb: "FF000000" } }
  //         }
  //       }

  //       currentRow++
  //     }

  //     // Add VTP orders (separate only when date changes)
  //     let lastVtpDate: string | null = null
  //     vtpOrders.forEach((order, index) => {
  //       const currentDate = formatDateExtended(order.date)

  //       // Add separator if date changed (but not for the first order)
  //       if (lastVtpDate !== null && lastVtpDate !== currentDate) {
  //         // We already added separator in addOrderRows, so we're good
  //       }

  //       // Determine if we should add separator after this order
  //       const nextOrder = vtpOrders[index + 1]
  //       const shouldAddSeparator =
  //         !nextOrder || formatDateExtended(nextOrder.date) !== currentDate

  //       if (shouldAddSeparator) {
  //         addOrderRows(order, vtpTotals, true)
  //       } else {
  //         // Don't add separator for this order, we'll handle it manually
  //         const funnel = order.salesFunnelId as any
  //         const funnelName = funnel?.name || ""
  //         let provinceName = funnel?.province?.name || ""
  //         provinceName = provinceName.replace(/^(Tỉnh|Thành phố)\s+/i, "")

  //         const customerInfo = `Shipcod (${funnelName} - ${provinceName})`
  //         const shippingTypeLabel = "VIETTEL POST"
  //         const taxValue = Math.round(order.total * 0.0075)

  //         // Build array of prepaid values (only non-zero values)
  //         const prepaidValues: number[] = []
  //         if (order.orderDiscount && order.orderDiscount > 0) {
  //           prepaidValues.push(order.orderDiscount)
  //         }
  //         if (order.otherDiscount && order.otherDiscount > 0) {
  //           prepaidValues.push(order.otherDiscount)
  //         }
  //         if (order.deposit && order.deposit > 0) {
  //           prepaidValues.push(order.deposit)
  //         }

  //         // Calculate total rows needed (max of items count and prepaid values count)
  //         const totalRowsNeeded = Math.max(
  //           order.items.length,
  //           prepaidValues.length
  //         )

  //         for (let i = 0; i < totalRowsNeeded; i++) {
  //           const item = i < order.items.length ? order.items[i] : null
  //           const thanhTien = item ? item.price * item.quantity : 0
  //           const taxForRow = i === 0 ? taxValue : 0
  //           const shippingForRow = i === 0 ? order.shippingCost || 0 : 0
  //           const prepaidForRow =
  //             i < prepaidValues.length ? prepaidValues[i] : 0

  //           // If there's an item, calculate normally
  //           // If no item but has prepaid value, show negative prepaid value
  //           const thuTien = item
  //             ? Math.round(
  //                 thanhTien + taxForRow + shippingForRow - prepaidForRow
  //               )
  //             : prepaidForRow > 0
  //               ? -prepaidForRow
  //               : 0

  //           const row = worksheet.addRow([
  //             formatDateExtended(order.date),
  //             customerInfo,
  //             item ? item.code : "",
  //             item ? item.name : "",
  //             item ? item.quantity : "",
  //             item ? item.price : "", // Number format
  //             item ? thanhTien : "", // Number format
  //             i === 0 ? taxValue : "",
  //             i === 0 ? order.shippingCost || 0 : "",
  //             prepaidForRow || "",
  //             thuTien || "", // Number format (can be negative)
  //             "",
  //             shippingTypeLabel,
  //             i === 0 ? formatDateExtended(order.receivedDate) : "",
  //             "",
  //             "",
  //             order.shippingCode || "",
  //             ""
  //           ])

  //           row.height = 27
  //           row.font = { name: "Times New Roman", size: 12 }
  //           row.alignment = {
  //             vertical: "middle",
  //             horizontal: "left",
  //             wrapText: true
  //           }
  //           row.getCell(1).alignment = {
  //             vertical: "middle",
  //             horizontal: "right",
  //             wrapText: true
  //           }
  //           row.getCell(2).alignment = {
  //             vertical: "middle",
  //             horizontal: "center",
  //             wrapText: true
  //           }
  //           row.getCell(2).font = {
  //             name: "Times New Roman",
  //             size: 12,
  //             bold: true,
  //             color: { argb: "FFFF0000" }
  //           }
  //           row.getCell(3).alignment = {
  //             vertical: "middle",
  //             horizontal: "left",
  //             wrapText: true
  //           }
  //           row.getCell(4).alignment = {
  //             vertical: "middle",
  //             horizontal: "left",
  //             wrapText: true
  //           }

  //           // Giá bán - right align, number format
  //           if (item) {
  //             row.getCell(6).alignment = {
  //               vertical: "middle",
  //               horizontal: "right",
  //               wrapText: true
  //             }
  //             row.getCell(6).numFmt = "#,##0"
  //           }

  //           // Thành tiền - right align, number format
  //           if (item) {
  //             row.getCell(7).alignment = {
  //               vertical: "middle",
  //               horizontal: "right",
  //               wrapText: true
  //             }
  //             row.getCell(7).numFmt = "#,##0"
  //           }

  //           // Thuế - number format
  //           if (i === 0) {
  //             row.getCell(8).numFmt = "#,##0"
  //           }

  //           // Tiền ship - number format
  //           if (i === 0) {
  //             row.getCell(9).numFmt = "#,##0"
  //           }

  //           // Khách trả tiền xe trước - number format
  //           if (prepaidForRow > 0) {
  //             row.getCell(10).numFmt = "#,##0"
  //           }

  //           // Thu tiền - number format
  //           if (item || prepaidForRow > 0) {
  //             row.getCell(11).numFmt = "#,##0"
  //           }

  //           row.getCell(13).fill = {
  //             type: "pattern",
  //             pattern: "solid",
  //             fgColor: { argb: "FFFEF2C9" }
  //           }

  //           for (let colNum = 1; colNum <= 17; colNum++) {
  //             row.getCell(colNum).border = {
  //               top: { style: "thin", color: { argb: "FF000000" } },
  //               left: { style: "thin", color: { argb: "FF000000" } },
  //               bottom: { style: "thin", color: { argb: "FF000000" } },
  //               right: { style: "thin", color: { argb: "FF000000" } }
  //             }
  //           }
  //           currentRow++
  //         }

  //         // Update totals
  //         vtpTotals.quantity += order.items.reduce(
  //           (sum: number, item: any) => sum + item.quantity,
  //           0
  //         )
  //         vtpTotals.thanhTien += order.total
  //         vtpTotals.tax += taxValue
  //         vtpTotals.shipping += order.shippingCost || 0
  //         vtpTotals.prepaid +=
  //           (order.orderDiscount || 0) +
  //           (order.otherDiscount || 0) +
  //           (order.deposit || 0)
  //         vtpTotals.collected +=
  //           order.total +
  //           taxValue +
  //           (order.shippingCost || 0) -
  //           (order.orderDiscount || 0) -
  //           (order.otherDiscount || 0) -
  //           (order.deposit || 0)
  //       }

  //       lastVtpDate = currentDate
  //     })

  //     // Add summary row for VTP
  //     if (vtpOrders.length > 0) {
  //       const vtpSummaryRow = worksheet.addRow([
  //         "",
  //         "",
  //         "",
  //         "",
  //         vtpTotals.quantity, // Number format
  //         "",
  //         vtpTotals.thanhTien, // Number format
  //         Math.round(vtpTotals.tax), // Number format
  //         vtpTotals.shipping, // Number format
  //         vtpTotals.prepaid, // Number format
  //         Math.round(vtpTotals.collected), // Number format
  //         "",
  //         "",
  //         "",
  //         "",
  //         "",
  //         "",
  //         ""
  //       ])

  //       vtpSummaryRow.height = 42

  //       // Merge cells for "TỔNG CỘNG VIETTEL POST"
  //       worksheet.mergeCells(currentRow, 1, currentRow, 4)
  //       worksheet.getCell(currentRow, 1).value = "TỔNG CỘNG VIETTEL POST"

  //       vtpSummaryRow.font = {
  //         name: "Times New Roman",
  //         size: 12,
  //         bold: true,
  //         color: { argb: "FFFF0000" }
  //       }
  //       vtpSummaryRow.fill = {
  //         type: "pattern",
  //         pattern: "solid",
  //         fgColor: { argb: "FFA8E9E3" }
  //       }
  //       vtpSummaryRow.alignment = { vertical: "middle", horizontal: "center" }

  //       // Apply number format to summary cells
  //       vtpSummaryRow.getCell(5).numFmt = "#,##0"
  //       vtpSummaryRow.getCell(7).numFmt = "#,##0"
  //       vtpSummaryRow.getCell(8).numFmt = "#,##0"
  //       vtpSummaryRow.getCell(9).numFmt = "#,##0"
  //       vtpSummaryRow.getCell(10).numFmt = "#,##0"
  //       vtpSummaryRow.getCell(11).numFmt = "#,##0"

  //       // Add borders to summary row (only columns 1-17)
  //       for (let colNum = 1; colNum <= 17; colNum++) {
  //         vtpSummaryRow.getCell(colNum).border = {
  //           top: { style: "thin", color: { argb: "FF000000" } },
  //           left: { style: "thin", color: { argb: "FF000000" } },
  //           bottom: { style: "thin", color: { argb: "FF000000" } },
  //           right: { style: "thin", color: { argb: "FF000000" } }
  //         }
  //       }

  //       currentRow++
  //     }

  //     // Add OTHER orders (always separate each order, similar to cargo)
  //     otherOrders.forEach((order) => addOrderRows(order, otherTotals, false))

  //     // Add summary row for OTHER immediately after other orders
  //     if (otherOrders.length > 0) {
  //       const otherSummaryRow = worksheet.addRow([
  //         "Ngày",
  //         "",
  //         "",
  //         "",
  //         otherTotals.quantity, // Number format
  //         "",
  //         otherTotals.thanhTien, // Number format
  //         Math.round(otherTotals.tax), // Number format
  //         otherTotals.shipping, // Number format
  //         otherTotals.prepaid, // Number format
  //         Math.round(otherTotals.collected), // Number format
  //         "",
  //         "",
  //         "",
  //         "",
  //         "",
  //         "",
  //         ""
  //       ])

  //       otherSummaryRow.height = 42

  //       // Merge cells for "TỔNG CỘNG KHÁC"
  //       worksheet.mergeCells(currentRow, 2, currentRow, 4)
  //       worksheet.getCell(currentRow, 2).value = "TỔNG CỘNG KHÁC"

  //       otherSummaryRow.font = {
  //         name: "Times New Roman",
  //         size: 12,
  //         bold: true,
  //         color: { argb: "FFFF0000" }
  //       }
  //       otherSummaryRow.fill = {
  //         type: "pattern",
  //         pattern: "solid",
  //         fgColor: { argb: "FFA8E9E3" }
  //       }
  //       otherSummaryRow.alignment = { vertical: "middle", horizontal: "center" }

  //       // Apply number format to summary cells
  //       otherSummaryRow.getCell(5).numFmt = "#,##0"
  //       otherSummaryRow.getCell(7).numFmt = "#,##0"
  //       otherSummaryRow.getCell(8).numFmt = "#,##0"
  //       otherSummaryRow.getCell(9).numFmt = "#,##0"
  //       otherSummaryRow.getCell(10).numFmt = "#,##0"
  //       otherSummaryRow.getCell(11).numFmt = "#,##0"

  //       // Add borders to summary row (only columns 1-17)
  //       for (let colNum = 1; colNum <= 17; colNum++) {
  //         otherSummaryRow.getCell(colNum).border = {
  //           top: { style: "thin", color: { argb: "FF000000" } },
  //           left: { style: "thin", color: { argb: "FF000000" } },
  //           bottom: { style: "thin", color: { argb: "FF000000" } },
  //           right: { style: "thin", color: { argb: "FF000000" } }
  //         }
  //       }

  //       currentRow++
  //     }

  //     // Add grand total row
  //     const grandTotalRow = worksheet.addRow([
  //       "",
  //       "",
  //       "",
  //       "",
  //       cargoTotals.quantity + vtpTotals.quantity + otherTotals.quantity, // Number format
  //       "",
  //       cargoTotals.thanhTien + vtpTotals.thanhTien + otherTotals.thanhTien, // Number format
  //       Math.round(cargoTotals.tax + vtpTotals.tax + otherTotals.tax), // Number format
  //       cargoTotals.shipping + vtpTotals.shipping + otherTotals.shipping, // Number format
  //       cargoTotals.prepaid + vtpTotals.prepaid + otherTotals.prepaid, // Number format
  //       Math.round(
  //         cargoTotals.collected + vtpTotals.collected + otherTotals.collected
  //       ), // Number format
  //       "",
  //       "",
  //       "",
  //       "",
  //       "",
  //       "",
  //       ""
  //     ])

  //     grandTotalRow.height = 42

  //     // Merge cells for "TỔNG CỘNG"
  //     worksheet.mergeCells(currentRow, 1, currentRow, 4)
  //     worksheet.getCell(currentRow, 1).value = "TỔNG CỘNG"

  //     grandTotalRow.font = {
  //       name: "Times New Roman",
  //       size: 12,
  //       bold: true,
  //       color: { argb: "FFFF0000" }
  //     }
  //     grandTotalRow.fill = {
  //       type: "pattern",
  //       pattern: "solid",
  //       fgColor: { argb: "FFF4B7BE" }
  //     }
  //     grandTotalRow.alignment = { vertical: "middle", horizontal: "center" }

  //     // Apply number format to grand total cells
  //     grandTotalRow.getCell(5).numFmt = "#,##0"
  //     grandTotalRow.getCell(7).numFmt = "#,##0"
  //     grandTotalRow.getCell(8).numFmt = "#,##0"
  //     grandTotalRow.getCell(9).numFmt = "#,##0"
  //     grandTotalRow.getCell(10).numFmt = "#,##0"
  //     grandTotalRow.getCell(11).numFmt = "#,##0"

  //     // Add borders to grand total row (only columns 1-17)
  //     for (let colNum = 1; colNum <= 17; colNum++) {
  //       grandTotalRow.getCell(colNum).border = {
  //         top: { style: "thin", color: { argb: "FF000000" } },
  //         left: { style: "thin", color: { argb: "FF000000" } },
  //         bottom: { style: "thin", color: { argb: "FF000000" } },
  //         right: { style: "thin", color: { argb: "FF000000" } }
  //       }
  //     }

  //     // Generate buffer
  //     const buffer = await workbook.xlsx.writeBuffer()
  //     return Buffer.from(buffer)
  //   } catch (error) {
  //     console.error(error)
  //     throw new HttpException(
  //       "Lỗi khi export đơn hàng",
  //       HttpStatus.INTERNAL_SERVER_ERROR
  //     )
  //   }
  // }

  async exportOrdersToExcelByOrderIds(orderIds: string[]): Promise<Buffer> {
    try {
      if (!Array.isArray(orderIds) || orderIds.length === 0) {
        throw new HttpException("orderIds is required", HttpStatus.BAD_REQUEST)
      }

      const validObjectIds = orderIds
        .map((id) => id?.trim())
        .filter((id) => Types.ObjectId.isValid(id))
        .map((id) => new Types.ObjectId(id))

      if (validObjectIds.length === 0) {
        throw new HttpException(
          "orderIds contains no valid ObjectId",
          HttpStatus.BAD_REQUEST
        )
      }

      const orders = await this.salesOrderModel
        .find({ _id: { $in: validObjectIds } })
        .populate({
          path: "salesFunnelId",
          populate: [
            { path: "channel", model: "saleschannels" },
            { path: "user", model: "users", select: "name email role" },
            { path: "province", model: "provinces" }
          ]
        })
        // sort này không ảnh hưởng output cuối vì bạn vẫn sort theo date theo nhóm ở dưới
        .sort({ createdAt: -1 })
        .lean()

      if (!orders || orders.length === 0) {
        throw new HttpException("No orders found", HttpStatus.NOT_FOUND)
      }

      return await this.buildOrdersExcelBuffer(orders)
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi export đơn hàng (orderIds)",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * OPTIONAL (recommended): refactor hàm cũ để dùng chung builder này
   */
  async exportOrdersToExcel(filters: {
    salesFunnelId?: string
    userId?: string
    channelId?: string
    returning?: boolean
    startDate?: Date
    endDate?: Date
    searchText?: string
    shippingType?: SalesOrderShippingType
    status?: SalesOrderStatus
  }): Promise<Buffer> {
    try {
      // --- GIỮ NGUYÊN đoạn build filter + fetch orders như hiện tại của bạn ---
      const filter: any = {}
      if (filters.salesFunnelId)
        filter.salesFunnelId = new Types.ObjectId(filters.salesFunnelId)
      if (filters.returning !== undefined) filter.returning = filters.returning
      if (filters.shippingType) filter.shippingType = filters.shippingType
      if (filters.status) filter.status = filters.status

      if (filters.channelId) {
        const funnelIds = await this.salesFunnelModel
          .find({ channel: new Types.ObjectId(filters.channelId) })
          .distinct("_id")
        filter.salesFunnelId = { $in: funnelIds }
      }

      if (filters.userId) {
        const funnelIds = await this.salesFunnelModel
          .find({ user: new Types.ObjectId(filters.userId) })
          .distinct("_id")
        filter.salesFunnelId = { $in: funnelIds }
      }

      if (filters.startDate || filters.endDate) {
        filter.date = {}
        if (filters.startDate) {
          const startDate = new Date(filters.startDate)
          startDate.setUTCHours(startDate.getUTCHours() - 7)
          filter.date.$gte = startDate
        }
        if (filters.endDate) {
          const endDate = new Date(filters.endDate)
          endDate.setUTCHours(endDate.getUTCHours() - 7)
          filter.date.$lte = endDate
        }
      }

      if (filters.searchText && filters.searchText.trim().length > 0) {
        const searchText = filters.searchText.trim()

        const matchingFunnels = await this.salesFunnelModel
          .find({
            $or: [
              { name: { $regex: `.*${searchText}.*`, $options: "i" } },
              { phoneNumber: { $regex: `.*${searchText}.*`, $options: "i" } },
              {
                secondaryPhoneNumbers: {
                  $regex: `.*${searchText}.*`,
                  $options: "i"
                }
              }
            ]
          })
          .distinct("_id")

        const searchRegex = { $regex: `.*${searchText}.*`, $options: "i" }

        filter.$or = [
          { shippingCode: searchRegex },
          { "items.code": searchRegex },
          { "items.name": searchRegex },
          { salesFunnelId: { $in: matchingFunnels } }
        ]
      }

      const orders = await this.salesOrderModel
        .find(filter)
        .populate({
          path: "salesFunnelId",
          populate: [
            { path: "channel", model: "saleschannels" },
            { path: "user", model: "users", select: "name email role" },
            { path: "province", model: "provinces" }
          ]
        })
        .sort({ createdAt: -1 })
        .lean()

      return await this.buildOrdersExcelBuffer(orders)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi export đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async convertToOfficial(
    orderId: string,
    shippingCode: string,
    shippingType: SalesOrderShippingType,
    tax: number,
    shippingCost: number,
    receivedDate?: Date
  ): Promise<SalesOrder> {
    try {
      const order = await this.salesOrderModel.findById(orderId)
      if (!order) {
        throw new HttpException("Order not found", HttpStatus.NOT_FOUND)
      }

      if (order.status === "official") {
        throw new HttpException(
          "Đơn hàng đã ở trạng thái chính thức",
          HttpStatus.BAD_REQUEST
        )
      }

      order.status = "official"
      order.shippingCode = shippingCode
      order.shippingType = shippingType
      order.tax = tax
      order.shippingCost = shippingCost
      if (receivedDate !== undefined) {
        order.receivedDate = receivedDate
      }
      // minus 7 hours
      order.date = new Date(
        new Date().setUTCHours(0, 0, 0, 0) - 7 * 3600 * 1000
      )
      order.updatedAt = new Date()

      const savedOrder = await order.save()
      await this.salesFunnelModel.findByIdAndUpdate(
        order.salesFunnelId.toString(),
        {
          $set: { stage: "customer" }
        }
      )

      return savedOrder
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi chuyển đơn hàng sang chính thức",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private async buildOrdersExcelBuffer(orders: any[]): Promise<Buffer> {
    // Separate orders by shipping type and sort by date
    const cargoOrders = orders
      .filter((o) => o.shippingType === "shipping_cargo")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const vtpOrders = orders
      .filter((o) => o.shippingType === "shipping_vtp")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    const otherOrders = orders
      .filter(
        (o) =>
          !o.shippingType ||
          (o.shippingType !== "shipping_cargo" &&
            o.shippingType !== "shipping_vtp")
      )
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

    // Create workbook using ExcelJS
    const workbook = new ExcelJS.Workbook()
    const worksheet = workbook.addWorksheet("Orders")

    // Define column widths (in pixels / 7 to approximate character width)
    const columnWidths = [
      88, 376, 140, 336, 104, 105, 105, 78, 97, 105, 105, 159, 247, 210, 160,
      123, 118, 147
    ]
    worksheet.columns = columnWidths.map((width, idx) => ({
      key: `col${idx + 1}`,
      width: width / 7
    }))

    // Define headers
    const headers = [
      "Ngày",
      "客户（省份）NPP",
      "Mã",
      "Sản phẩm",
      "Số lượng",
      "Giá bán - 外部价格",
      "Thành tiền 销售金额",
      "Thuế 0.75%",
      "Tiền ship",
      "Khách trả tiền xe trước - 客户先付运费",
      "Thu tiền",
      "Còn phải thu",
      "备注 NPP",
      "Ngày thu tiền",
      "Nguồn gốc",
      "Kho xuất hàng",
      "Mã vận đơn",
      ""
    ]

    // Add header row
    const headerRow = worksheet.addRow(headers)
    headerRow.height = 71
    headerRow.font = {
      name: "Times New Roman",
      size: 12,
      bold: true,
      color: { argb: "FFFF0000" }
    }
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFFF04" }
    }
    headerRow.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true
    }

    // Add borders to header
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } }
      }
    })

    let currentRow = 2

    // Helper function to format number with thousands separator (kept for parity)
    const formatNumber = (num: number): string => {
      return num.toLocaleString("vi-VN")
    }
    void formatNumber // avoid unused lint if you have strict rules

    // Helper function to format date
    const formatDateExtended = (date: Date): string => {
      if (!date) return ""
      const d = new Date(date)
      // Add 7 hours
      d.setUTCHours(d.getUTCHours() + 7)
      const day = d.getDate()
      const month = d.getMonth() + 1
      const year = d.getFullYear()
      return `${day}/${month}/${year}`
    }

    // Track totals for each section
    let cargoTotals = {
      quantity: 0,
      thanhTien: 0,
      tax: 0,
      shipping: 0,
      prepaid: 0,
      collected: 0
    }

    let vtpTotals = {
      quantity: 0,
      thanhTien: 0,
      tax: 0,
      shipping: 0,
      prepaid: 0,
      collected: 0
    }

    let otherTotals = {
      quantity: 0,
      thanhTien: 0,
      tax: 0,
      shipping: 0,
      prepaid: 0,
      collected: 0
    }

    // Helper function to add order rows (always adds separator row at end)
    const addOrderRows = (order: any, totals: any) => {
      const funnel = order.salesFunnelId as any
      const funnelName = funnel?.name || ""
      let provinceName = funnel?.province?.name || ""

      // Remove "Tỉnh" or "Thành phố" prefix from province name
      provinceName = provinceName.replace(/^(Tỉnh|Thành phố)\s+/i, "")

      // Customer info based on shipping type
      let customerInfo = ""
      if (order.shippingType === "shipping_vtp") {
        customerInfo = `Shipcod (${funnelName} - ${provinceName})`
      } else if (order.shippingType === "shipping_cargo") {
        customerInfo = `Chành (${funnelName} - ${provinceName})`
      } else {
        customerInfo = `${funnelName} - ${provinceName}`
      }

      // Shipping type label
      const shippingTypeLabel =
        order.shippingType === "shipping_vtp"
          ? "VIETTEL POST"
          : order.shippingType === "shipping_cargo"
            ? "SHIPCOD LÊN CHÀNH"
            : "KHÁC"

      // Calculate tax (only for VTP)
      const taxValue =
        order.shippingType === "shipping_vtp"
          ? Math.round(order.total * 0.0075)
          : 0

      // Build array of prepaid values (only non-zero values)
      const prepaidValues: number[] = []
      if (order.orderDiscount && order.orderDiscount > 0) {
        prepaidValues.push(order.orderDiscount)
      }
      if (order.otherDiscount && order.otherDiscount > 0) {
        prepaidValues.push(order.otherDiscount)
      }
      if (order.deposit && order.deposit > 0) {
        prepaidValues.push(order.deposit)
      }

      // Calculate total rows needed (max of items count and prepaid values count)
      const totalRowsNeeded = Math.max(order.items.length, prepaidValues.length)

      for (let i = 0; i < totalRowsNeeded; i++) {
        const item = i < order.items.length ? order.items[i] : null
        const thanhTien = item ? item.price * item.quantity : 0

        // Calculate "Thu tiền" for this item
        const taxForRow = i === 0 ? taxValue : 0
        const shippingForRow = i === 0 ? order.shippingCost || 0 : 0
        const prepaidForRow = i < prepaidValues.length ? prepaidValues[i] : 0

        // If there's an item, calculate normally
        // If no item but has prepaid value, show negative prepaid value
        const thuTien = item
          ? Math.round(thanhTien + taxForRow + shippingForRow - prepaidForRow)
          : prepaidForRow > 0
            ? -prepaidForRow
            : 0

        const row = worksheet.addRow([
          formatDateExtended(order.date), // Always show date
          customerInfo, // Always show NPP
          item ? item.code : "",
          item ? item.name : "",
          item ? item.quantity : "",
          item ? item.price : "", // Number format
          item ? thanhTien : "", // Number format
          i === 0 && order.shippingType === "shipping_vtp" ? taxValue : "",
          i === 0 ? order.shippingCost || 0 : "",
          prepaidForRow || "",
          thuTien || "", // Number format (can be negative)
          "",
          shippingTypeLabel, // Always show shipping type label
          i === 0 ? formatDateExtended(order.receivedDate) : "",
          "",
          "",
          order.shippingCode || "", // Always show shipping code
          ""
        ])

        // Set row height
        row.height = 27

        // Apply Times New Roman font size 12
        row.font = { name: "Times New Roman", size: 12 }
        row.alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true
        }

        // Ngày - right align
        row.getCell(1).alignment = {
          vertical: "middle",
          horizontal: "right",
          wrapText: true
        }

        // 客户（省份）NPP - center, red, bold
        row.getCell(2).alignment = {
          vertical: "middle",
          horizontal: "center",
          wrapText: true
        }
        row.getCell(2).font = {
          name: "Times New Roman",
          size: 12,
          bold: true,
          color: { argb: "FFFF0000" }
        }

        // Mã - left align
        row.getCell(3).alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true
        }

        // Sản phẩm - left align
        row.getCell(4).alignment = {
          vertical: "middle",
          horizontal: "left",
          wrapText: true
        }

        // Giá bán - right align, number format
        if (item) {
          row.getCell(6).alignment = {
            vertical: "middle",
            horizontal: "right",
            wrapText: true
          }
          row.getCell(6).numFmt = "#,##0"
        }

        // Thành tiền - right align, number format
        if (item) {
          row.getCell(7).alignment = {
            vertical: "middle",
            horizontal: "right",
            wrapText: true
          }
          row.getCell(7).numFmt = "#,##0"
        }

        // Thuế - number format
        if (i === 0 && order.shippingType === "shipping_vtp") {
          row.getCell(8).numFmt = "#,##0"
        }

        // Tiền ship - number format
        if (i === 0) {
          row.getCell(9).numFmt = "#,##0"
        }

        // Khách trả tiền xe trước - number format
        if (prepaidForRow > 0) {
          row.getCell(10).numFmt = "#,##0"
        }

        // Thu tiền - number format
        if (item || prepaidForRow > 0) {
          row.getCell(11).numFmt = "#,##0"
        }

        // 备注 NPP (shippingType) - beige background
        row.getCell(13).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF2C9" }
        }

        // Add borders to cells within the table (columns 1-17 only)
        for (let colNum = 1; colNum <= 17; colNum++) {
          row.getCell(colNum).border = {
            top: { style: "thin", color: { argb: "FF000000" } },
            left: { style: "thin", color: { argb: "FF000000" } },
            bottom: { style: "thin", color: { argb: "FF000000" } },
            right: { style: "thin", color: { argb: "FF000000" } }
          }
        }

        currentRow++
      }

      // Update totals
      totals.quantity += order.items.reduce(
        (sum: number, item: any) => sum + item.quantity,
        0
      )
      totals.thanhTien += order.total
      totals.tax += taxValue
      totals.shipping += order.shippingCost || 0
      totals.prepaid +=
        (order.orderDiscount || 0) +
        (order.otherDiscount || 0) +
        (order.deposit || 0)
      totals.collected +=
        order.total +
        taxValue +
        (order.shippingCost || 0) -
        (order.orderDiscount || 0) -
        (order.otherDiscount || 0) -
        (order.deposit || 0)

      // Add separator row (beige)
      const separatorRow = worksheet.addRow(Array(18).fill(""))
      separatorRow.height = 27
      for (let colNum = 1; colNum <= 17; colNum++) {
        separatorRow.getCell(colNum).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFEF2C9" }
        }
        separatorRow.getCell(colNum).border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      }
      currentRow++
    }

    // 1) Add cargo orders (always separate each order)
    cargoOrders.forEach((order) => addOrderRows(order, cargoTotals))

    // Add summary row for cargo immediately after cargo orders
    if (cargoOrders.length > 0) {
      const cargoSummaryRow = worksheet.addRow([
        "Ngày",
        "",
        "",
        "",
        cargoTotals.quantity,
        "",
        cargoTotals.thanhTien,
        Math.round(cargoTotals.tax),
        cargoTotals.shipping,
        cargoTotals.prepaid,
        Math.round(cargoTotals.collected),
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ])

      cargoSummaryRow.height = 42

      // Merge cells for "TỔNG CỘNG ĐI CHÀNH"
      worksheet.mergeCells(currentRow, 2, currentRow, 4)
      worksheet.getCell(currentRow, 2).value = "TỔNG CỘNG ĐI CHÀNH"

      cargoSummaryRow.font = {
        name: "Times New Roman",
        size: 12,
        bold: true,
        color: { argb: "FFFF0000" }
      }
      cargoSummaryRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFA8E9E3" }
      }
      cargoSummaryRow.alignment = { vertical: "middle", horizontal: "center" }

      cargoSummaryRow.getCell(5).numFmt = "#,##0"
      cargoSummaryRow.getCell(7).numFmt = "#,##0"
      cargoSummaryRow.getCell(8).numFmt = "#,##0"
      cargoSummaryRow.getCell(9).numFmt = "#,##0"
      cargoSummaryRow.getCell(10).numFmt = "#,##0"
      cargoSummaryRow.getCell(11).numFmt = "#,##0"

      for (let colNum = 1; colNum <= 17; colNum++) {
        cargoSummaryRow.getCell(colNum).border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      }

      currentRow++
    }

    // 2) Add VTP orders (separator only when date changes)
    let lastVtpDate: string | null = null
    vtpOrders.forEach((order, index) => {
      const currentDate = formatDateExtended(order.date)

      const nextOrder = vtpOrders[index + 1]
      const shouldAddSeparator =
        !nextOrder || formatDateExtended(nextOrder.date) !== currentDate

      if (shouldAddSeparator) {
        addOrderRows(order, vtpTotals)
      } else {
        // Manual add without adding separator row (exactly as your original)
        const funnel = order.salesFunnelId as any
        const funnelName = funnel?.name || ""
        let provinceName = funnel?.province?.name || ""
        provinceName = provinceName.replace(/^(Tỉnh|Thành phố)\s+/i, "")

        const customerInfo = `Shipcod (${funnelName} - ${provinceName})`
        const shippingTypeLabel = "VIETTEL POST"
        const taxValue = Math.round(order.total * 0.0075)

        const prepaidValues: number[] = []
        if (order.orderDiscount && order.orderDiscount > 0) {
          prepaidValues.push(order.orderDiscount)
        }
        if (order.otherDiscount && order.otherDiscount > 0) {
          prepaidValues.push(order.otherDiscount)
        }
        if (order.deposit && order.deposit > 0) {
          prepaidValues.push(order.deposit)
        }

        const totalRowsNeeded = Math.max(
          order.items.length,
          prepaidValues.length
        )

        for (let i = 0; i < totalRowsNeeded; i++) {
          const item = i < order.items.length ? order.items[i] : null
          const thanhTien = item ? item.price * item.quantity : 0
          const taxForRow = i === 0 ? taxValue : 0
          const shippingForRow = i === 0 ? order.shippingCost || 0 : 0
          const prepaidForRow = i < prepaidValues.length ? prepaidValues[i] : 0

          const thuTien = item
            ? Math.round(thanhTien + taxForRow + shippingForRow - prepaidForRow)
            : prepaidForRow > 0
              ? -prepaidForRow
              : 0

          const row = worksheet.addRow([
            formatDateExtended(order.date),
            customerInfo,
            item ? item.code : "",
            item ? item.name : "",
            item ? item.quantity : "",
            item ? item.price : "",
            item ? thanhTien : "",
            i === 0 ? taxValue : "",
            i === 0 ? order.shippingCost || 0 : "",
            prepaidForRow || "",
            thuTien || "",
            "",
            shippingTypeLabel,
            i === 0 ? formatDateExtended(order.receivedDate) : "",
            "",
            "",
            order.shippingCode || "",
            ""
          ])

          row.height = 27
          row.font = { name: "Times New Roman", size: 12 }
          row.alignment = {
            vertical: "middle",
            horizontal: "left",
            wrapText: true
          }
          row.getCell(1).alignment = {
            vertical: "middle",
            horizontal: "right",
            wrapText: true
          }
          row.getCell(2).alignment = {
            vertical: "middle",
            horizontal: "center",
            wrapText: true
          }
          row.getCell(2).font = {
            name: "Times New Roman",
            size: 12,
            bold: true,
            color: { argb: "FFFF0000" }
          }
          row.getCell(3).alignment = {
            vertical: "middle",
            horizontal: "left",
            wrapText: true
          }
          row.getCell(4).alignment = {
            vertical: "middle",
            horizontal: "left",
            wrapText: true
          }

          if (item) {
            row.getCell(6).alignment = {
              vertical: "middle",
              horizontal: "right",
              wrapText: true
            }
            row.getCell(6).numFmt = "#,##0"

            row.getCell(7).alignment = {
              vertical: "middle",
              horizontal: "right",
              wrapText: true
            }
            row.getCell(7).numFmt = "#,##0"
          }

          if (i === 0) row.getCell(8).numFmt = "#,##0"
          if (i === 0) row.getCell(9).numFmt = "#,##0"
          if (prepaidForRow > 0) row.getCell(10).numFmt = "#,##0"
          if (item || prepaidForRow > 0) row.getCell(11).numFmt = "#,##0"

          row.getCell(13).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFEF2C9" }
          }

          for (let colNum = 1; colNum <= 17; colNum++) {
            row.getCell(colNum).border = {
              top: { style: "thin", color: { argb: "FF000000" } },
              left: { style: "thin", color: { argb: "FF000000" } },
              bottom: { style: "thin", color: { argb: "FF000000" } },
              right: { style: "thin", color: { argb: "FF000000" } }
            }
          }
          currentRow++
        }

        vtpTotals.quantity += order.items.reduce(
          (sum: number, item: any) => sum + item.quantity,
          0
        )
        vtpTotals.thanhTien += order.total
        vtpTotals.tax += taxValue
        vtpTotals.shipping += order.shippingCost || 0
        vtpTotals.prepaid +=
          (order.orderDiscount || 0) +
          (order.otherDiscount || 0) +
          (order.deposit || 0)
        vtpTotals.collected +=
          order.total +
          taxValue +
          (order.shippingCost || 0) -
          (order.orderDiscount || 0) -
          (order.otherDiscount || 0) -
          (order.deposit || 0)
      }

      lastVtpDate = currentDate
      void lastVtpDate
    })

    // Add summary row for VTP
    if (vtpOrders.length > 0) {
      const vtpSummaryRow = worksheet.addRow([
        "",
        "",
        "",
        "",
        vtpTotals.quantity,
        "",
        vtpTotals.thanhTien,
        Math.round(vtpTotals.tax),
        vtpTotals.shipping,
        vtpTotals.prepaid,
        Math.round(vtpTotals.collected),
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ])

      vtpSummaryRow.height = 42

      worksheet.mergeCells(currentRow, 1, currentRow, 4)
      worksheet.getCell(currentRow, 1).value = "TỔNG CỘNG VIETTEL POST"

      vtpSummaryRow.font = {
        name: "Times New Roman",
        size: 12,
        bold: true,
        color: { argb: "FFFF0000" }
      }
      vtpSummaryRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFA8E9E3" }
      }
      vtpSummaryRow.alignment = { vertical: "middle", horizontal: "center" }

      vtpSummaryRow.getCell(5).numFmt = "#,##0"
      vtpSummaryRow.getCell(7).numFmt = "#,##0"
      vtpSummaryRow.getCell(8).numFmt = "#,##0"
      vtpSummaryRow.getCell(9).numFmt = "#,##0"
      vtpSummaryRow.getCell(10).numFmt = "#,##0"
      vtpSummaryRow.getCell(11).numFmt = "#,##0"

      for (let colNum = 1; colNum <= 17; colNum++) {
        vtpSummaryRow.getCell(colNum).border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      }

      currentRow++
    }

    // 3) Add OTHER orders (always separate each order, similar to cargo)
    otherOrders.forEach((order) => addOrderRows(order, otherTotals))

    // Add summary row for OTHER immediately after other orders
    if (otherOrders.length > 0) {
      const otherSummaryRow = worksheet.addRow([
        "Ngày",
        "",
        "",
        "",
        otherTotals.quantity,
        "",
        otherTotals.thanhTien,
        Math.round(otherTotals.tax),
        otherTotals.shipping,
        otherTotals.prepaid,
        Math.round(otherTotals.collected),
        "",
        "",
        "",
        "",
        "",
        "",
        ""
      ])

      otherSummaryRow.height = 42

      worksheet.mergeCells(currentRow, 2, currentRow, 4)
      worksheet.getCell(currentRow, 2).value = "TỔNG CỘNG KHÁC"

      otherSummaryRow.font = {
        name: "Times New Roman",
        size: 12,
        bold: true,
        color: { argb: "FFFF0000" }
      }
      otherSummaryRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFA8E9E3" }
      }
      otherSummaryRow.alignment = { vertical: "middle", horizontal: "center" }

      otherSummaryRow.getCell(5).numFmt = "#,##0"
      otherSummaryRow.getCell(7).numFmt = "#,##0"
      otherSummaryRow.getCell(8).numFmt = "#,##0"
      otherSummaryRow.getCell(9).numFmt = "#,##0"
      otherSummaryRow.getCell(10).numFmt = "#,##0"
      otherSummaryRow.getCell(11).numFmt = "#,##0"

      for (let colNum = 1; colNum <= 17; colNum++) {
        otherSummaryRow.getCell(colNum).border = {
          top: { style: "thin", color: { argb: "FF000000" } },
          left: { style: "thin", color: { argb: "FF000000" } },
          bottom: { style: "thin", color: { argb: "FF000000" } },
          right: { style: "thin", color: { argb: "FF000000" } }
        }
      }

      currentRow++
    }

    // 4) Grand total row
    const grandTotalRow = worksheet.addRow([
      "",
      "",
      "",
      "",
      cargoTotals.quantity + vtpTotals.quantity + otherTotals.quantity,
      "",
      cargoTotals.thanhTien + vtpTotals.thanhTien + otherTotals.thanhTien,
      Math.round(cargoTotals.tax + vtpTotals.tax + otherTotals.tax),
      cargoTotals.shipping + vtpTotals.shipping + otherTotals.shipping,
      cargoTotals.prepaid + vtpTotals.prepaid + otherTotals.prepaid,
      Math.round(
        cargoTotals.collected + vtpTotals.collected + otherTotals.collected
      ),
      "",
      "",
      "",
      "",
      "",
      "",
      ""
    ])

    grandTotalRow.height = 42

    worksheet.mergeCells(currentRow, 1, currentRow, 4)
    worksheet.getCell(currentRow, 1).value = "TỔNG CỘNG"

    grandTotalRow.font = {
      name: "Times New Roman",
      size: 12,
      bold: true,
      color: { argb: "FFFF0000" }
    }
    grandTotalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFF4B7BE" }
    }
    grandTotalRow.alignment = { vertical: "middle", horizontal: "center" }

    grandTotalRow.getCell(5).numFmt = "#,##0"
    grandTotalRow.getCell(7).numFmt = "#,##0"
    grandTotalRow.getCell(8).numFmt = "#,##0"
    grandTotalRow.getCell(9).numFmt = "#,##0"
    grandTotalRow.getCell(10).numFmt = "#,##0"
    grandTotalRow.getCell(11).numFmt = "#,##0"

    for (let colNum = 1; colNum <= 17; colNum++) {
      grandTotalRow.getCell(colNum).border = {
        top: { style: "thin", color: { argb: "FF000000" } },
        left: { style: "thin", color: { argb: "FF000000" } },
        bottom: { style: "thin", color: { argb: "FF000000" } },
        right: { style: "thin", color: { argb: "FF000000" } }
      }
    }

    const buffer = await workbook.xlsx.writeBuffer()
    return Buffer.from(buffer as ArrayBuffer)
  }
}
