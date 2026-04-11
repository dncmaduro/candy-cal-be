import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { ShopeeDailyLiveRevenue } from "../database/mongoose/schemas/ShopeeDailyLiveRevenue"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"
import {
  CreateShopeeDailyLiveRevenueDto,
  UpdateShopeeDailyLiveRevenueDto
} from "./dto/shopeedailyliverevenues.dto"

const SHOPEE_DAILY_LIVE_REVENUE_TIME_ZONE = "Asia/Ho_Chi_Minh"

type ShopeeDailyLiveRevenueFilters = {
  page?: number
  limit?: number
  channel?: string
  date?: string
  startDate?: string
  endDate?: string
}

@Injectable()
export class ShopeeDailyLiveRevenuesService {
  constructor(
    @InjectModel("shopeedailyliverevenues")
    private readonly shopeeDailyLiveRevenueModel: Model<ShopeeDailyLiveRevenue>,
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>
  ) {}

  private normalizeDateToBusinessDay(date: Date): Date {
    const localDate = formatInTimeZone(
      date,
      SHOPEE_DAILY_LIVE_REVENUE_TIME_ZONE,
      "yyyy-MM-dd"
    )
    return fromZonedTime(
      `${localDate}T00:00:00`,
      SHOPEE_DAILY_LIVE_REVENUE_TIME_ZONE
    )
  }

  private parseAndNormalizeDate(value: Date | string, fieldName = "Ngày"): Date {
    const rawDate = new Date(value)
    if (Number.isNaN(rawDate.getTime())) {
      throw new HttpException(`${fieldName} không hợp lệ`, HttpStatus.BAD_REQUEST)
    }
    return this.normalizeDateToBusinessDay(rawDate)
  }

  private validateLiveRevenue(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new HttpException(
        "Doanh số live phải là số không âm",
        HttpStatus.BAD_REQUEST
      )
    }
  }

  private async getShopeeChannelOrThrow(
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

  async createShopeeDailyLiveRevenue(
    dto: CreateShopeeDailyLiveRevenueDto
  ): Promise<ShopeeDailyLiveRevenue> {
    try {
      const date = this.parseAndNormalizeDate(dto.date)
      this.validateLiveRevenue(Number(dto.liveRevenue))

      const channel = await this.getShopeeChannelOrThrow(dto.channel)
      const channelObjectId = channel._id as Types.ObjectId

      const existed = await this.shopeeDailyLiveRevenueModel
        .findOne({
          date,
          channel: channelObjectId
        })
        .exec()

      if (existed) {
        throw new HttpException(
          "Đã có doanh số live Shopee cho ngày/kênh này",
          HttpStatus.CONFLICT
        )
      }

      const created = await this.shopeeDailyLiveRevenueModel.create({
        date,
        channel: channelObjectId,
        liveRevenue: Number(dto.liveRevenue)
      })

      const populated = await this.shopeeDailyLiveRevenueModel
        .findById(created._id)
        .populate("channel")
        .exec()

      return populated as unknown as ShopeeDailyLiveRevenue
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi tạo doanh số live Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getShopeeDailyLiveRevenues(
    filters: ShopeeDailyLiveRevenueFilters
  ): Promise<{ data: ShopeeDailyLiveRevenue[]; total: number }> {
    try {
      const page = Math.max(1, Number(filters.page) || 1)
      const limit = Math.max(1, Math.min(100, Number(filters.limit) || 10))
      const query: any = {}

      if (typeof filters.channel === "string" && filters.channel.trim() !== "") {
        const channel = await this.getShopeeChannelOrThrow(filters.channel.trim())
        query.channel = channel._id
      }

      if (typeof filters.date === "string" && filters.date.trim() !== "") {
        query.date = this.parseAndNormalizeDate(filters.date.trim())
      } else if (filters.startDate || filters.endDate) {
        query.date = {}
        if (filters.startDate) {
          query.date.$gte = this.parseAndNormalizeDate(
            filters.startDate,
            "Ngày bắt đầu"
          )
        }
        if (filters.endDate) {
          query.date.$lte = this.parseAndNormalizeDate(
            filters.endDate,
            "Ngày kết thúc"
          )
        }
      }

      const [data, total] = await Promise.all([
        this.shopeeDailyLiveRevenueModel
          .find(query)
          .populate("channel")
          .sort({ date: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
        this.shopeeDailyLiveRevenueModel.countDocuments(query).exec()
      ])

      return { data, total }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi lấy danh sách doanh số live Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getShopeeDailyLiveRevenueById(
    id: string
  ): Promise<ShopeeDailyLiveRevenue> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const doc = await this.shopeeDailyLiveRevenueModel
        .findById(id)
        .populate("channel")
        .exec()

      if (!doc) {
        throw new HttpException(
          "Không tìm thấy doanh số live Shopee",
          HttpStatus.NOT_FOUND
        )
      }

      return doc
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi lấy chi tiết doanh số live Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateShopeeDailyLiveRevenue(
    id: string,
    dto: UpdateShopeeDailyLiveRevenueDto
  ): Promise<ShopeeDailyLiveRevenue> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const existing = await this.shopeeDailyLiveRevenueModel.findById(id).exec()
      if (!existing) {
        throw new HttpException(
          "Không tìm thấy doanh số live Shopee",
          HttpStatus.NOT_FOUND
        )
      }

      const nextDate =
        typeof dto.date === "undefined"
          ? existing.date
          : this.parseAndNormalizeDate(dto.date)

      let nextChannelId = existing.channel
      if (typeof dto.channel === "string" && dto.channel.trim() !== "") {
        const channel = await this.getShopeeChannelOrThrow(dto.channel.trim())
        nextChannelId = channel._id as Types.ObjectId
      }

      if (typeof dto.liveRevenue !== "undefined") {
        this.validateLiveRevenue(Number(dto.liveRevenue))
      }

      const duplicate = await this.shopeeDailyLiveRevenueModel
        .findOne({
          _id: { $ne: existing._id },
          date: nextDate,
          channel: nextChannelId
        })
        .exec()

      if (duplicate) {
        throw new HttpException(
          "Đã có doanh số live Shopee cho ngày/kênh này",
          HttpStatus.CONFLICT
        )
      }

      existing.date = nextDate
      existing.channel = nextChannelId

      if (typeof dto.liveRevenue !== "undefined") {
        existing.liveRevenue = Number(dto.liveRevenue)
      }

      await existing.save()

      const populated = await this.shopeeDailyLiveRevenueModel
        .findById(existing._id)
        .populate("channel")
        .exec()

      return populated as unknown as ShopeeDailyLiveRevenue
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi cập nhật doanh số live Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteShopeeDailyLiveRevenue(id: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const deleted =
        await this.shopeeDailyLiveRevenueModel.findByIdAndDelete(id).exec()
      if (!deleted) {
        throw new HttpException(
          "Không tìm thấy doanh số live Shopee",
          HttpStatus.NOT_FOUND
        )
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi xóa doanh số live Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
