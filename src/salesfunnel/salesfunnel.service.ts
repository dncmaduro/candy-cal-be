import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import {
  SalesFunnel,
  SalesFunnelSource,
  SalesFunnelStage
} from "../database/mongoose/schemas/SalesFunnel"
import { User } from "../database/mongoose/schemas/User"
import { SalesOrder } from "../database/mongoose/schemas/SalesOrder"
import {
  SalesCustomerRank,
  Rank
} from "../database/mongoose/schemas/SalesCustomerRank"
import { SalesChannel } from "../database/mongoose/schemas/SalesChannel"
import { Province } from "../database/mongoose/schemas/Province"
import { SalesActivity } from "../database/mongoose/schemas/SalesActivity"
import * as XLSX from "xlsx"

interface XlsxFunnelData {
  Tên?: string
  SĐT?: string
  "Tỉnh tp"?: string
  "Địa chỉ"?: string
  Kênh?: string
  "Giai đoạn"?: string
  "Ngày tạo"?: string
}

@Injectable()
export class SalesFunnelService {
  constructor(
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>,
    @InjectModel("users")
    private readonly userModel: Model<User>,
    @InjectModel("salesorders")
    private readonly salesOrderModel: Model<SalesOrder>,
    @InjectModel("salescustomerranks")
    private readonly salesCustomerRankModel: Model<SalesCustomerRank>,
    @InjectModel("saleschannels")
    private readonly salesChannelModel: Model<SalesChannel>,
    @InjectModel("provinces")
    private readonly provinceModel: Model<Province>,
    @InjectModel("salesactivities")
    private readonly salesActivityModel: Model<SalesActivity>
  ) {}

  async createLead(payload: {
    name: string
    channel: string
    funnelSource: SalesFunnelSource
  }): Promise<SalesFunnel> {
    try {
      // Get channel and its assigned user
      const channel = await this.salesChannelModel.findById(payload.channel)
      if (!channel) {
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
      }

      if (!channel.assignedTo) {
        throw new HttpException(
          "Kênh này chưa có người phụ trách",
          HttpStatus.BAD_REQUEST
        )
      }

      // Validate assigned user has sales-emp role
      const user = await this.userModel.findById(channel.assignedTo).lean()
      if (!user) {
        throw new HttpException(
          "Người phụ trách kênh không tồn tại",
          HttpStatus.NOT_FOUND
        )
      }
      if (!user.roles || !user.roles.includes("sales-emp")) {
        throw new HttpException(
          "Người phụ trách kênh không có quyền sales-emp",
          HttpStatus.BAD_REQUEST
        )
      }

      const now = new Date()
      const doc = new this.salesFunnelModel({
        name: payload.name,
        channel: new Types.ObjectId(payload.channel),
        user: new Types.ObjectId(channel.assignedTo.toString()),
        stage: "lead",
        updateStageLogs: [
          {
            stage: "lead",
            updatedAt: now
          }
        ],
        funnelSource: payload.funnelSource
      })
      return await doc.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo lead mới",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async uploadFunnels(file: Express.Multer.File): Promise<{
    success: true
    inserted: number
    skipped: number
    warnings?: string[]
    totalWarnings?: number
  }> {
    try {
      // Read Excel file
      const workbook = XLSX.read(file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet) as XlsxFunnelData[]

      if (!data || data.length === 0) {
        throw new HttpException(
          "File trống hoặc không hợp lệ",
          HttpStatus.BAD_REQUEST
        )
      }

      let inserted = 0
      let skipped = 0
      const errors: string[] = []

      // Pre-fetch all channels and provinces for mapping
      const [channels, provinces] = await Promise.all([
        this.salesChannelModel.find().lean(),
        this.provinceModel.find().lean()
      ])

      for (let i = 0; i < data.length; i++) {
        const row = data[i]
        const rowNumber = i + 2 // Excel rows start at 1, plus header row

        try {
          // Skip empty rows
          if (!row["Tên"] && !row["SĐT"]) {
            continue
          }

          const name = row["Tên"] ? row["Tên"].toString().trim() : ""
          const phoneNumber = row["SĐT"] ? row["SĐT"].toString().trim() : ""
          const provinceName = row["Tỉnh tp"]
            ? row["Tỉnh tp"].toString().trim()
            : ""
          const address = row["Địa chỉ"] ? row["Địa chỉ"].toString().trim() : ""
          const channelName = row["Kênh"] ? row["Kênh"].toString().trim() : ""
          const stageValue = row["Giai đoạn"]
            ? row["Giai đoạn"].toString().trim().toLowerCase()
            : "lead"
          const createdAtValue = row["Ngày tạo"]
            ? row["Ngày tạo"].toString().trim()
            : ""

          // Validate required fields
          if (!name) {
            errors.push(`Dòng ${rowNumber}: Thiếu tên khách hàng`)
            continue
          }

          if (!channelName) {
            errors.push(`Dòng ${rowNumber}: Thiếu kênh`)
            continue
          }

          // Find channel
          const channel = channels.find(
            (c) =>
              c.channelName.toLowerCase() === channelName.toLowerCase() ||
              c.channelName.toLowerCase().includes(channelName.toLowerCase())
          )
          if (!channel) {
            errors.push(
              `Dòng ${rowNumber}: Không tìm thấy kênh "${channelName}"`
            )
            continue
          }

          // Get user from channel's assignedTo
          if (!channel.assignedTo) {
            errors.push(
              `Dòng ${rowNumber}: Kênh "${channelName}" chưa có người phụ trách`
            )
            continue
          }

          // Find province (optional) - LIKE %{cellValue}% search
          let province = null
          if (provinceName) {
            province = provinces.find((p) =>
              p.name.toLowerCase().includes(provinceName.toLowerCase())
            )
            if (!province) {
              errors.push(
                `Dòng ${rowNumber}: Không tìm thấy tỉnh/tp "${provinceName}", bỏ qua`
              )
            }
          }

          // Map stage
          let stage: SalesFunnelStage = "lead"
          const stageLower = stageValue.toLowerCase()
          if (stageLower.includes("lead") || stageLower.includes("tiềm năng")) {
            stage = "lead"
          } else if (
            stageLower.includes("contacted") ||
            stageLower.includes("đã liên hệ")
          ) {
            stage = "contacted"
          } else if (
            stageLower.includes("customer") ||
            stageLower.includes("khách hàng")
          ) {
            stage = "customer"
          } else if (
            stageLower.includes("closed") ||
            stageLower.includes("đóng")
          ) {
            stage = "closed"
          } else if (stageValue) {
            errors.push(
              `Dòng ${rowNumber}: Giai đoạn "${stageValue}" không hợp lệ, sử dụng mặc định "lead"`
            )
          }

          // Parse createdAt
          let createdAt = new Date()
          if (createdAtValue) {
            const parsedDate = new Date(createdAtValue)
            if (!isNaN(parsedDate.getTime())) {
              createdAt = parsedDate
            } else {
              errors.push(
                `Dòng ${rowNumber}: Ngày tạo không hợp lệ, sử dụng ngày hiện tại`
              )
            }
          }

          // Check if funnel exists by phoneNumber
          const existingFunnel = phoneNumber
            ? await this.salesFunnelModel.findOne({ phoneNumber })
            : null

          if (existingFunnel) {
            // Skip if phone number already exists
            errors.push(
              `Dòng ${rowNumber}: Số điện thoại "${phoneNumber}" đã tồn tại, bỏ qua`
            )
            skipped++
            continue
          }

          // Create new funnel
          await this.salesFunnelModel.create({
            name,
            phoneNumber: phoneNumber || undefined,
            address: address || undefined,
            channel: new Types.ObjectId(channel._id.toString()),
            user: new Types.ObjectId(channel.assignedTo.toString()),
            province: province
              ? new Types.ObjectId(province._id.toString())
              : undefined,
            stage,
            updateStageLogs: [
              {
                stage,
                updatedAt: createdAt
              }
            ],
            createdAt,
            updatedAt: createdAt
          })
          inserted++
        } catch (error) {
          errors.push(`Dòng ${rowNumber}: ${error.message}`)
        }
      }

      // Return success with warnings if any
      return {
        success: true,
        inserted,
        skipped,
        ...(errors.length > 0 && {
          warnings: errors.slice(0, 20), // Show first 20 warnings
          totalWarnings: errors.length
        })
      } as any
    } catch (error) {
      console.error("Error in uploadFunnels:", error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Có lỗi khi xử lý file Excel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Generate Excel template for funnel upload
   */
  async generateUploadTemplate(): Promise<Buffer> {
    const workbook = XLSX.utils.book_new()

    // Define headers
    const headers = [
      "Tên",
      "SĐT",
      "Tỉnh tp",
      "Địa chỉ",
      "Kênh",
      "Giai đoạn",
      "Ngày tạo"
    ]

    // Define sample data rows
    const sampleData = [
      [
        "Nguyễn Văn A",
        "0123456789",
        "Hà Nội",
        "123 Đường ABC, Quận 1",
        "My Candy Việt Nam",
        "lead",
        "2024-01-01 (Format yyyy-mm-dd)"
      ],
      [
        "Trần Thị C",
        "0987654321",
        "Thành phố Hồ Chí Minh",
        "456 Đường XYZ, Quận 2",
        "Tổng kho Huy Hoàng",
        "customer",
        "2024-01-15"
      ],
      [
        "Lê Văn E",
        "0912345678",
        "Đà Nẵng",
        "789 Đường DEF, Quận 3",
        "Tổng kho Huy Hoàng",
        "contacted",
        "2024-02-01"
      ]
    ]

    // Combine headers and sample data
    const data = [headers, ...sampleData]

    // Create worksheet
    const worksheet = XLSX.utils.aoa_to_sheet(data)

    // Set column widths for better readability
    worksheet["!cols"] = [
      { wch: 20 }, // Tên
      { wch: 15 }, // SĐT
      { wch: 15 }, // Tỉnh tp
      { wch: 30 }, // Địa chỉ
      { wch: 15 }, // Kênh
      { wch: 15 }, // Giai đoạn
      { wch: 15 } // Ngày tạo
    ]

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Funnels")

    // Generate buffer
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })

    return buffer
  }

  async moveToContacted(
    id: string,
    payload: {
      province?: string
      phoneNumber?: string
    },
    user: string,
    isAdmin = false
  ): Promise<SalesFunnel> {
    try {
      const funnel = await this.salesFunnelModel.findById(id)
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check ownership - skip for admin
      if (!isAdmin && funnel.user.toString() !== user) {
        throw new HttpException(
          "Bạn không có quyền cập nhật lead này",
          HttpStatus.FORBIDDEN
        )
      }

      // Validate stage transition: only lead -> contacted
      if (funnel.stage !== "lead") {
        throw new HttpException(
          "Chỉ có thể chuyển từ lead sang contacted",
          HttpStatus.BAD_REQUEST
        )
      }

      if (payload.province) {
        funnel.province = new Types.ObjectId(payload.province)
      }
      funnel.phoneNumber = payload.phoneNumber
      funnel.stage = "contacted"
      funnel.updatedAt = new Date()

      // Log stage change
      if (!funnel.updateStageLogs) {
        funnel.updateStageLogs = []
      }
      funnel.updateStageLogs.push({
        stage: "contacted",
        updatedAt: new Date()
      })

      return await funnel.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi chuyển sang contacted",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateStage(
    id: string,
    newStage: SalesFunnelStage,
    user: string,
    isAdmin = false
  ): Promise<SalesFunnel> {
    try {
      const funnel = await this.salesFunnelModel.findById(id)
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check ownership - skip for admin
      if (!isAdmin && funnel.user.toString() !== user) {
        throw new HttpException(
          "Bạn không có quyền cập nhật lead này",
          HttpStatus.FORBIDDEN
        )
      }

      const currentStage = funnel.stage

      // closed can be from any stage, no validation needed

      funnel.stage = newStage
      funnel.updatedAt = new Date()

      // Log stage change
      if (!funnel.updateStageLogs) {
        funnel.updateStageLogs = []
      }
      funnel.updateStageLogs.push({
        stage: newStage,
        updatedAt: new Date()
      })

      return await funnel.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật stage",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateInfo(
    id: string,
    payload: {
      name?: string
      province?: string
      phoneNumber?: string
      secondaryPhoneNumbers?: string[]
      address?: string
      channel?: string
      hasBuyed?: boolean
      funnelSource?: SalesFunnelSource
      fromSystem?: boolean
    },
    user: string,
    isAdmin = false
  ): Promise<SalesFunnel> {
    try {
      const funnel = await this.salesFunnelModel.findById(id)
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check ownership - skip for admin
      if (!isAdmin && funnel.user.toString() !== user) {
        throw new HttpException(
          "Bạn không có quyền cập nhật lead này",
          HttpStatus.FORBIDDEN
        )
      }

      // If channel is being updated, get the assigned user from new channel
      if (payload.channel) {
        const channel = await this.salesChannelModel.findById(payload.channel)
        if (!channel) {
          throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
        }

        if (!channel.assignedTo) {
          throw new HttpException(
            "Kênh này chưa có người phụ trách",
            HttpStatus.BAD_REQUEST
          )
        }

        // Validate assigned user has sales-emp role
        const newUser = await this.userModel.findById(channel.assignedTo).lean()
        if (!newUser) {
          throw new HttpException(
            "Người phụ trách kênh không tồn tại",
            HttpStatus.NOT_FOUND
          )
        }
        if (!newUser.roles || !newUser.roles.includes("sales-emp")) {
          throw new HttpException(
            "Người phụ trách kênh không có quyền sales-emp",
            HttpStatus.BAD_REQUEST
          )
        }

        // Update both channel and user
        funnel.channel = new Types.ObjectId(payload.channel)
        funnel.user = new Types.ObjectId(channel.assignedTo.toString())
      }

      // Update other fields (excluding stage)
      if (payload.name) funnel.name = payload.name
      if (payload.province)
        funnel.province = new Types.ObjectId(payload.province)
      if (payload.phoneNumber !== undefined)
        funnel.phoneNumber = payload.phoneNumber
      if (payload.secondaryPhoneNumbers !== undefined)
        funnel.secondaryPhoneNumbers = payload.secondaryPhoneNumbers
      if (payload.address !== undefined) funnel.address = payload.address
      if (payload.hasBuyed !== undefined) funnel.hasBuyed = payload.hasBuyed
      if (payload.funnelSource !== undefined)
        funnel.funnelSource = payload.funnelSource
      if (payload.fromSystem !== undefined)
        funnel.fromSystem = payload.fromSystem

      funnel.updatedAt = new Date()

      return await funnel.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật thông tin",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async searchFunnels(
    filters: {
      stage?: SalesFunnelStage
      channel?: string
      province?: string
      user?: string
      searchText?: string
      rank?: Rank
      startDate?: Date
      endDate?: Date
      noActivityDays?: number
      funnelSource?: SalesFunnelSource
    },
    page = 1,
    limit = 10
  ): Promise<{ data: any[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter: any = {}
      if (filters.stage) filter.stage = filters.stage
      if (filters.channel) filter.channel = new Types.ObjectId(filters.channel)
      if (filters.province)
        filter.province = new Types.ObjectId(filters.province)
      if (filters.user) filter.user = new Types.ObjectId(filters.user)
      if (filters.funnelSource) filter.funnelSource = filters.funnelSource

      // Date range filter
      if (filters.startDate || filters.endDate) {
        filter.createdAt = {}
        if (filters.startDate) filter.createdAt.$gte = filters.startDate
        if (filters.endDate) filter.createdAt.$lte = filters.endDate
      }

      if (filters.searchText && filters.searchText.trim().length > 0) {
        const searchRegex = {
          $regex: `.*${filters.searchText.trim()}.*`,
          $options: "i"
        }
        filter.$or = [
          { name: searchRegex },
          { phoneNumber: searchRegex },
          { secondaryPhoneNumbers: searchRegex },
          { address: searchRegex }
        ]
      }

      // Filter by no activity days
      let funnelIdsWithNoActivity: string[] | undefined
      if (filters.noActivityDays && filters.noActivityDays > 0) {
        // Calculate the cutoff date (current date - noActivityDays)
        const cutoffDate = new Date()
        cutoffDate.setDate(cutoffDate.getDate() - filters.noActivityDays)

        // Find all funnels that have activities after cutoff date
        const recentActivities = await this.salesActivityModel
          .find({
            time: { $gte: cutoffDate }
          })
          .distinct("salesFunnelId")

        // Get all funnel IDs
        const allFunnelIds = await this.salesFunnelModel
          .find(filter)
          .distinct("_id")

        // Filter out funnels with recent activities
        funnelIdsWithNoActivity = allFunnelIds
          .map((id) => id.toString())
          .filter(
            (id) => !recentActivities.some((actId) => actId.toString() === id)
          )

        // Add to filter
        filter._id = {
          $in: funnelIdsWithNoActivity.map((id) => new Types.ObjectId(id))
        }
      }

      const [funnels, total] = await Promise.all([
        this.salesFunnelModel
          .find(filter)
          .populate("province", "name")
          .populate("channel", "channelName")
          .populate("user", "name")
          .sort({ createdAt: -1 })
          .skip((safePage - 1) * safeLimit)
          .limit(safeLimit)
          .lean(),
        this.salesFunnelModel.countDocuments(filter)
      ])

      // Enrich each funnel with stats and last activity time
      let enrichedFunnels = await Promise.all(
        funnels.map(async (funnel) => {
          const enriched = await this.enrichFunnelWithStats(funnel)

          // Get last activity for this funnel
          const lastActivity = await this.salesActivityModel
            .findOne({ salesFunnelId: funnel._id })
            .sort({ time: -1 })
            .lean()

          return {
            ...enriched,
            lastActivityTime: lastActivity?.time || null,
            daysSinceLastActivity: lastActivity
              ? Math.floor(
                  (new Date().getTime() -
                    new Date(lastActivity.time).getTime()) /
                    (1000 * 60 * 60 * 24)
                )
              : null
          }
        })
      )

      // Filter by rank if specified (done after enrichment since rank is calculated)
      if (filters.rank) {
        enrichedFunnels = enrichedFunnels.filter(
          (funnel) => funnel.rank === filters.rank
        )
      }

      // Recalculate total if rank filter was applied
      const finalTotal = filters.rank ? enrichedFunnels.length : total

      return { data: enrichedFunnels, total: finalTotal }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tìm kiếm funnel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getFunnelById(id: string): Promise<any> {
    try {
      const funnel = await this.salesFunnelModel
        .findById(id)
        .populate("province", "name")
        .populate("channel", "channelName")
        .populate("user", "username name")
        .lean()

      if (!funnel) {
        return null
      }

      return await this.enrichFunnelWithStats(funnel)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy thông tin funnel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async isPsidExists(psid: string): Promise<boolean> {
    try {
      const exists = await this.salesFunnelModel.findOne({ psid }).exec()
      return !!exists
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy thông tin funnel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async createFunnelFromPsid(
    psid: string,
    name: string,
    channel: string
  ): Promise<SalesFunnel> {
    try {
      // Get channel and its assigned user
      const channelDoc = await this.salesChannelModel.findById(channel)
      if (!channelDoc) {
        throw new HttpException("Channel not found", HttpStatus.NOT_FOUND)
      }

      // Use assigned user from channel, or fallback to default user if not assigned
      const userId = channelDoc.assignedTo
        ? channelDoc.assignedTo.toString()
        : "646666666666666666666666"

      const now = new Date()
      const doc = new this.salesFunnelModel({
        psid,
        name,
        channel: new Types.ObjectId(channel),
        user: new Types.ObjectId(userId),
        stage: "lead",
        updateStageLogs: [
          {
            stage: "lead",
            updatedAt: now
          }
        ]
      })
      return await doc.save()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo funnel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getFunnelByPsid(psid: string): Promise<SalesFunnel | null> {
    try {
      return await this.salesFunnelModel.findOne({ psid }).lean()
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy thông tin funnel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateCost(id: string, cost: number): Promise<SalesFunnel> {
    try {
      const funnel = await this.salesFunnelModel.findByIdAndUpdate(
        id,
        { $set: { cost } },
        { new: true }
      )
      if (!funnel)
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      return funnel
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật chi phí",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateResponsibleUser(
    id: string,
    newUserId: string,
    currentUserId: string,
    isAdmin = false
  ): Promise<SalesFunnel> {
    try {
      // Validate new user has sales-emp role
      const newUser = await this.userModel.findById(newUserId).lean()
      if (!newUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }
      if (!newUser.roles || !newUser.roles.includes("sales-emp")) {
        throw new HttpException(
          "User must have sales-emp role",
          HttpStatus.BAD_REQUEST
        )
      }

      const funnel = await this.salesFunnelModel.findById(id)
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check permission: only admin or current responsible user can update
      if (!isAdmin && funnel.user.toString() !== currentUserId) {
        throw new HttpException(
          "Bạn không có quyền thay đổi nhân viên phụ trách lead này",
          HttpStatus.FORBIDDEN
        )
      }

      funnel.user = new Types.ObjectId(newUserId)
      funnel.updatedAt = new Date()

      return await funnel.save()
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật nhân viên phụ trách",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async checkFunnelPermission(
    funnelId: string,
    userId: string,
    isAdmin: boolean
  ): Promise<{
    hasPermission: boolean
    isAdmin: boolean
    isResponsible: boolean
  }> {
    try {
      const funnel = await this.salesFunnelModel.findById(funnelId).lean()
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      const isResponsible = funnel.user.toString() === userId
      const hasPermission = isAdmin || isResponsible

      return {
        hasPermission,
        isAdmin,
        isResponsible
      }
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error(error)
      throw new HttpException(
        "Lỗi khi kiểm tra quyền truy cập funnel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private async calculateTotalIncome(funnelId: string): Promise<number> {
    try {
      const orders = await this.salesOrderModel
        .find({ salesFunnelId: funnelId })
        .lean()

      let totalIncome = 0
      orders.forEach((order) => {
        // Calculate final amount: total - orderDiscount - otherDiscount + tax + shippingCost
        const totalDiscount =
          (order.orderDiscount || 0) + (order.otherDiscount || 0)
        const orderAmount =
          order.total -
          totalDiscount +
          (order.tax || 0) +
          (order.shippingCost || 0) -
          (order.deposit || 0)
        totalIncome += orderAmount
      })

      return totalIncome
    } catch (error) {
      console.error("Error calculating total income:", error)
      return 0
    }
  }

  private async calculateCustomerRank(
    totalIncome: number
  ): Promise<Rank | null> {
    try {
      // Get all ranks sorted by minIncome descending
      const ranks = await this.salesCustomerRankModel
        .find()
        .sort({ minIncome: -1 })
        .lean()

      // Find the highest rank where totalIncome >= minIncome
      for (const rank of ranks) {
        if (totalIncome >= rank.minIncome) {
          return rank.rank
        }
      }

      return null // No rank if income is below all thresholds
    } catch (error) {
      console.error("Error calculating customer rank:", error)
      return null
    }
  }

  async enrichFunnelWithStats(funnel: any): Promise<any> {
    const funnelId = funnel._id.toString()
    const totalIncome = await this.calculateTotalIncome(funnelId)
    const rank = await this.calculateCustomerRank(totalIncome)

    return {
      ...funnel,
      totalIncome,
      rank
    }
  }

  async getFunnelsByUser(
    userId: string,
    limit: number = 20
  ): Promise<SalesFunnel[]> {
    try {
      // Validate user exists
      const user = await this.userModel.findById(userId).lean()
      if (!user) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      const funnels = await this.salesFunnelModel
        .find({ user: new Types.ObjectId(userId) })
        .populate("province", "name")
        .populate("channel", "channelName")
        .populate("user", "name username")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean()

      return funnels
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getFunnelsByUser:", error)
      throw new HttpException(
        "Lỗi khi lấy danh sách funnel của nhân viên",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
