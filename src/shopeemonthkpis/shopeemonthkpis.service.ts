import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { ShopeeMonthKpi } from "../database/mongoose/schemas/ShopeeMonthKpi"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"
import {
  CreateShopeeMonthKpiDto,
  UpdateShopeeMonthKpiDto
} from "./dto/shopeemonthkpis.dto"

type ShopeeMonthKpiFilters = {
  page?: number
  limit?: number
  month?: number
  year?: number
  channel?: string
}

@Injectable()
export class ShopeeMonthKpisService {
  constructor(
    @InjectModel("shopeemonthkpis")
    private readonly shopeeMonthKpiModel: Model<ShopeeMonthKpi>,
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>
  ) {}

  private validateMonth(month: number): void {
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new HttpException("Tháng không hợp lệ", HttpStatus.BAD_REQUEST)
    }
  }

  private validateYear(year: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 3000) {
      throw new HttpException("Năm không hợp lệ", HttpStatus.BAD_REQUEST)
    }
  }

  private validateKpiValue(value: number, fieldName: string): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new HttpException(
        `${fieldName} phải là số không âm`,
        HttpStatus.BAD_REQUEST
      )
    }
  }

  private async getShopeeLivestreamChannelOrThrow(
    channelId: string
  ): Promise<LivestreamChannel> {
    if (!Types.ObjectId.isValid(channelId)) {
      throw new HttpException("ID kênh không hợp lệ", HttpStatus.BAD_REQUEST)
    }

    const channel = await this.livestreamChannelModel.findById(channelId).exec()
    if (!channel) {
      throw new HttpException("Không tìm thấy kênh", HttpStatus.NOT_FOUND)
    }
    if (channel.platform !== "shopee") {
      throw new HttpException(
        "Kênh được chọn không thuộc platform Shopee",
        HttpStatus.BAD_REQUEST
      )
    }

    return channel
  }

  async createShopeeMonthKpi(
    dto: CreateShopeeMonthKpiDto
  ): Promise<ShopeeMonthKpi> {
    try {
      this.validateMonth(dto.month)
      this.validateYear(dto.year)
      this.validateKpiValue(dto.revenueKpi, "KPI doanh thu")
      this.validateKpiValue(dto.adsCostKpi, "KPI chi phí ads")
      this.validateKpiValue(dto.roasKpi, "KPI ROAS")

      const channel = await this.getShopeeLivestreamChannelOrThrow(dto.channel)
      const channelObjectId = channel._id as Types.ObjectId

      const existed = await this.shopeeMonthKpiModel
        .findOne({
          month: dto.month,
          year: dto.year,
          channel: channelObjectId
        })
        .exec()

      if (existed) {
        throw new HttpException(
          "Đã có KPI Shopee cho tháng/năm/kênh này",
          HttpStatus.CONFLICT
        )
      }

      const created = await this.shopeeMonthKpiModel.create({
        month: dto.month,
        year: dto.year,
        channel: channelObjectId,
        revenueKpi: dto.revenueKpi,
        adsCostKpi: dto.adsCostKpi,
        roasKpi: dto.roasKpi
      })

      const populated = await this.shopeeMonthKpiModel
        .findById(created._id)
        .populate("channel")
        .exec()

      return populated as unknown as ShopeeMonthKpi
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi tạo KPI Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getShopeeMonthKpis(
    filters: ShopeeMonthKpiFilters
  ): Promise<{ data: ShopeeMonthKpi[]; total: number }> {
    try {
      const page = Math.max(1, Number(filters.page) || 1)
      const limit = Math.max(1, Math.min(100, Number(filters.limit) || 10))

      const query: any = {}

      if (typeof filters.month !== "undefined") {
        this.validateMonth(Number(filters.month))
        query.month = Number(filters.month)
      }

      if (typeof filters.year !== "undefined") {
        this.validateYear(Number(filters.year))
        query.year = Number(filters.year)
      }

      if (typeof filters.channel === "string" && filters.channel.trim() !== "") {
        const channel = await this.getShopeeLivestreamChannelOrThrow(
          filters.channel.trim()
        )
        query.channel = channel._id
      }

      const [data, total] = await Promise.all([
        this.shopeeMonthKpiModel
          .find(query)
          .populate("channel")
          .sort({ year: -1, month: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
        this.shopeeMonthKpiModel.countDocuments(query).exec()
      ])

      return { data, total }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi lấy danh sách KPI Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getShopeeMonthKpiById(id: string): Promise<ShopeeMonthKpi> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID KPI không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const kpi = await this.shopeeMonthKpiModel
        .findById(id)
        .populate("channel")
        .exec()

      if (!kpi) {
        throw new HttpException(
          "Không tìm thấy KPI Shopee",
          HttpStatus.NOT_FOUND
        )
      }

      return kpi
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi lấy chi tiết KPI Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateShopeeMonthKpi(
    id: string,
    dto: UpdateShopeeMonthKpiDto
  ): Promise<ShopeeMonthKpi> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID KPI không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const existing = await this.shopeeMonthKpiModel.findById(id).exec()
      if (!existing) {
        throw new HttpException(
          "Không tìm thấy KPI Shopee",
          HttpStatus.NOT_FOUND
        )
      }

      const nextMonth =
        typeof dto.month === "undefined" ? existing.month : Number(dto.month)
      const nextYear =
        typeof dto.year === "undefined" ? existing.year : Number(dto.year)

      this.validateMonth(nextMonth)
      this.validateYear(nextYear)

      let nextChannelId = existing.channel
      if (typeof dto.channel === "string" && dto.channel.trim() !== "") {
        const channel = await this.getShopeeLivestreamChannelOrThrow(
          dto.channel.trim()
        )
        nextChannelId = channel._id as Types.ObjectId
      }

      if (typeof dto.revenueKpi !== "undefined") {
        this.validateKpiValue(Number(dto.revenueKpi), "KPI doanh thu")
      }
      if (typeof dto.adsCostKpi !== "undefined") {
        this.validateKpiValue(Number(dto.adsCostKpi), "KPI chi phí ads")
      }
      if (typeof dto.roasKpi !== "undefined") {
        this.validateKpiValue(Number(dto.roasKpi), "KPI ROAS")
      }

      const duplicate = await this.shopeeMonthKpiModel
        .findOne({
          _id: { $ne: existing._id },
          month: nextMonth,
          year: nextYear,
          channel: nextChannelId
        })
        .exec()

      if (duplicate) {
        throw new HttpException(
          "Đã có KPI Shopee cho tháng/năm/kênh này",
          HttpStatus.CONFLICT
        )
      }

      existing.month = nextMonth
      existing.year = nextYear
      existing.channel = nextChannelId

      if (typeof dto.revenueKpi !== "undefined") {
        existing.revenueKpi = Number(dto.revenueKpi)
      }
      if (typeof dto.adsCostKpi !== "undefined") {
        existing.adsCostKpi = Number(dto.adsCostKpi)
      }
      if (typeof dto.roasKpi !== "undefined") {
        existing.roasKpi = Number(dto.roasKpi)
      }

      await existing.save()

      const populated = await this.shopeeMonthKpiModel
        .findById(existing._id)
        .populate("channel")
        .exec()

      return populated as unknown as ShopeeMonthKpi
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi cập nhật KPI Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteShopeeMonthKpi(id: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID KPI không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const deleted = await this.shopeeMonthKpiModel.findByIdAndDelete(id).exec()
      if (!deleted) {
        throw new HttpException(
          "Không tìm thấy KPI Shopee",
          HttpStatus.NOT_FOUND
        )
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi xóa KPI Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
