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

      // Filter by user (funnel responsible)
      if (filters.userId) {
        const funnelIds = await this.salesFunnelModel
          .find({ user: new Types.ObjectId(filters.userId) })
          .distinct("_id")
        filter.salesFunnelId = { $in: funnelIds }
      }

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

  async exportOrdersToExcel(filters: {
    salesFunnelId?: string
    userId?: string
    returning?: boolean
    startDate?: Date
    endDate?: Date
    searchText?: string
    shippingType?: SalesOrderShippingType
    status?: SalesOrderStatus
  }): Promise<Buffer> {
    try {
      // Build filter (same as searchOrders but without pagination)
      const filter: any = {}
      if (filters.salesFunnelId)
        filter.salesFunnelId = new Types.ObjectId(filters.salesFunnelId)
      if (filters.returning !== undefined) filter.returning = filters.returning
      if (filters.shippingType) filter.shippingType = filters.shippingType
      if (filters.status) filter.status = filters.status

      // Filter by user (funnel responsible)
      if (filters.userId) {
        const funnelIds = await this.salesFunnelModel
          .find({ user: new Types.ObjectId(filters.userId) })
          .distinct("_id")
        filter.salesFunnelId = { $in: funnelIds }
      }

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

  async convertToOfficial(
    orderId: string,
    tax: number,
    shippingCost: number
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
      order.tax = tax
      order.shippingCost = shippingCost
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
}
