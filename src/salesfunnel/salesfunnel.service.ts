import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import {
  SalesFunnel,
  SalesFunnelStage
} from "../database/mongoose/schemas/SalesFunnel"

@Injectable()
export class SalesFunnelService {
  constructor(
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>
  ) {}

  async createLead(payload: {
    name: string
    facebook: string
    channel: string
    user: string
  }): Promise<SalesFunnel> {
    try {
      const now = new Date()
      const doc = new this.salesFunnelModel({
        name: payload.name,
        facebook: payload.facebook,
        channel: new Types.ObjectId(payload.channel),
        user: new Types.ObjectId(payload.user),
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
        "Lỗi khi tạo lead mới",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async moveToContacted(
    id: string,
    payload: {
      province: string
      phoneNumber: string
    },
    user: string
  ): Promise<SalesFunnel> {
    try {
      const funnel = await this.salesFunnelModel.findById(id)
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check ownership
      if (funnel.user.toString() !== user) {
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

      funnel.province = new Types.ObjectId(payload.province)
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
    user: string
  ): Promise<SalesFunnel> {
    try {
      const funnel = await this.salesFunnelModel.findById(id)
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check ownership
      if (funnel.user.toString() !== user) {
        throw new HttpException(
          "Bạn không có quyền cập nhật lead này",
          HttpStatus.FORBIDDEN
        )
      }

      const currentStage = funnel.stage

      // Validate stage transitions
      if (newStage === "contacted" && currentStage !== "lead") {
        throw new HttpException(
          "Contacted chỉ có thể chuyển từ lead",
          HttpStatus.BAD_REQUEST
        )
      }

      if (newStage === "customer" && currentStage !== "contacted") {
        throw new HttpException(
          "Customer chỉ có thể chuyển từ contacted",
          HttpStatus.BAD_REQUEST
        )
      }

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
      facebook?: string
      province?: string
      phoneNumber?: string
      channel?: string
      hasBuyed?: boolean
    },
    user: string
  ): Promise<SalesFunnel> {
    try {
      const funnel = await this.salesFunnelModel.findById(id)
      if (!funnel) {
        throw new HttpException("Funnel not found", HttpStatus.NOT_FOUND)
      }

      // Check ownership
      if (funnel.user.toString() !== user) {
        throw new HttpException(
          "Bạn không có quyền cập nhật lead này",
          HttpStatus.FORBIDDEN
        )
      }

      // Update fields (excluding stage)
      if (payload.name) funnel.name = payload.name
      if (payload.facebook) funnel.facebook = payload.facebook
      if (payload.province)
        funnel.province = new Types.ObjectId(payload.province)
      if (payload.phoneNumber) funnel.phoneNumber = payload.phoneNumber
      if (payload.channel) funnel.channel = new Types.ObjectId(payload.channel)
      if (payload.hasBuyed !== undefined) funnel.hasBuyed = payload.hasBuyed

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
    },
    page = 1,
    limit = 10
  ): Promise<{ data: SalesFunnel[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const filter: any = {}
      if (filters.stage) filter.stage = filters.stage
      if (filters.channel) filter.channel = new Types.ObjectId(filters.channel)
      if (filters.province)
        filter.province = new Types.ObjectId(filters.province)
      if (filters.user) filter.user = new Types.ObjectId(filters.user)

      if (filters.searchText && filters.searchText.trim().length > 0) {
        const searchRegex = {
          $regex: `.*${filters.searchText.trim()}.*`,
          $options: "i"
        }
        filter.$or = [
          { name: searchRegex },
          { facebook: searchRegex },
          { phoneNumber: searchRegex }
        ]
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

      return { data: funnels as SalesFunnel[], total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tìm kiếm funnel",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getFunnelById(id: string): Promise<SalesFunnel | null> {
    try {
      return await this.salesFunnelModel
        .findById(id)
        .populate("province", "name")
        .populate("channel", "channelName")
        .populate("user", "username")
        .lean()
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
    facebook: string,
    channel: string
  ): Promise<SalesFunnel> {
    try {
      const now = new Date()
      const doc = new this.salesFunnelModel({
        psid,
        name,
        facebook,
        channel: new Types.ObjectId(channel),
        user: new Types.ObjectId("646666666666666666666666"),
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
}
