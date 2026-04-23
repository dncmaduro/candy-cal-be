import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"
import { ShopeeDailyAds } from "../database/mongoose/schemas/ShopeeDailyAds"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"
import {
  CreateShopeeDailyAdsDto,
  UpdateShopeeDailyAdsDto
} from "./dto/shopeedailyads.dto"

const SHOPEE_DAILY_ADS_TIME_ZONE = "Asia/Ho_Chi_Minh"

type ShopeeDailyAdsFilters = {
  page?: number
  limit?: number
  channel?: string
  date?: string
  startDate?: string
  endDate?: string
}

@Injectable()
export class ShopeeDailyAdsService {
  constructor(
    @InjectModel("shopeedailyads")
    private readonly shopeeDailyAdsModel: Model<ShopeeDailyAds>,
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>
  ) {}

  private normalizeDateToBusinessDay(date: Date): Date {
    const localDate = formatInTimeZone(
      date,
      SHOPEE_DAILY_ADS_TIME_ZONE,
      "yyyy-MM-dd"
    )
    return fromZonedTime(`${localDate}T00:00:00`, SHOPEE_DAILY_ADS_TIME_ZONE)
  }

  private parseAndNormalizeDate(value: Date | string, fieldName = "Ngày"): Date {
    const rawDate = new Date(value)
    if (Number.isNaN(rawDate.getTime())) {
      throw new HttpException(`${fieldName} không hợp lệ`, HttpStatus.BAD_REQUEST)
    }
    return this.normalizeDateToBusinessDay(rawDate)
  }

  private validateAdsCost(value: number): void {
    if (!Number.isFinite(value) || value < 0) {
      throw new HttpException(
        "Chi phí ads phải là số không âm",
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

  async createShopeeDailyAds(
    dto: CreateShopeeDailyAdsDto
  ): Promise<ShopeeDailyAds> {
    try {
      const date = this.parseAndNormalizeDate(dto.date)
      this.validateAdsCost(Number(dto.adsCost))

      const channel = await this.getShopeeLivestreamChannelOrThrow(dto.channel)
      const channelObjectId = channel._id as Types.ObjectId

      const existed = await this.shopeeDailyAdsModel
        .findOne({
          date,
          channel: channelObjectId
        })
        .exec()

      if (existed) {
        throw new HttpException(
          "Đã có chi phí ads Shopee cho ngày/kênh này",
          HttpStatus.CONFLICT
        )
      }

      const created = await this.shopeeDailyAdsModel.create({
        date,
        channel: channelObjectId,
        adsCost: Number(dto.adsCost)
      })

      const populated = await this.shopeeDailyAdsModel
        .findById(created._id)
        .populate("channel")
        .exec()

      return populated as unknown as ShopeeDailyAds
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi tạo chi phí ads Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getShopeeDailyAds(
    filters: ShopeeDailyAdsFilters
  ): Promise<{ data: ShopeeDailyAds[]; total: number }> {
    try {
      const page = Math.max(1, Number(filters.page) || 1)
      const limit = Math.max(1, Math.min(100, Number(filters.limit) || 10))
      const query: any = {}

      if (typeof filters.channel === "string" && filters.channel.trim() !== "") {
        const channel = await this.getShopeeLivestreamChannelOrThrow(
          filters.channel.trim()
        )
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
        this.shopeeDailyAdsModel
          .find(query)
          .populate("channel")
          .sort({ date: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .exec(),
        this.shopeeDailyAdsModel.countDocuments(query).exec()
      ])

      return { data, total }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi lấy danh sách chi phí ads Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getShopeeDailyAdsById(id: string): Promise<ShopeeDailyAds> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const doc = await this.shopeeDailyAdsModel
        .findById(id)
        .populate("channel")
        .exec()

      if (!doc) {
        throw new HttpException(
          "Không tìm thấy chi phí ads Shopee",
          HttpStatus.NOT_FOUND
        )
      }

      return doc
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi lấy chi tiết chi phí ads Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateShopeeDailyAds(
    id: string,
    dto: UpdateShopeeDailyAdsDto
  ): Promise<ShopeeDailyAds> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const existing = await this.shopeeDailyAdsModel.findById(id).exec()
      if (!existing) {
        throw new HttpException(
          "Không tìm thấy chi phí ads Shopee",
          HttpStatus.NOT_FOUND
        )
      }

      const nextDate =
        typeof dto.date === "undefined"
          ? existing.date
          : this.parseAndNormalizeDate(dto.date)

      let nextChannelId = existing.channel
      if (typeof dto.channel === "string" && dto.channel.trim() !== "") {
        const channel = await this.getShopeeLivestreamChannelOrThrow(
          dto.channel.trim()
        )
        nextChannelId = channel._id as Types.ObjectId
      }

      if (typeof dto.adsCost !== "undefined") {
        this.validateAdsCost(Number(dto.adsCost))
      }

      const duplicate = await this.shopeeDailyAdsModel
        .findOne({
          _id: { $ne: existing._id },
          date: nextDate,
          channel: nextChannelId
        })
        .exec()

      if (duplicate) {
        throw new HttpException(
          "Đã có chi phí ads Shopee cho ngày/kênh này",
          HttpStatus.CONFLICT
        )
      }

      existing.date = nextDate
      existing.channel = nextChannelId

      if (typeof dto.adsCost !== "undefined") {
        existing.adsCost = Number(dto.adsCost)
      }

      await existing.save()

      const populated = await this.shopeeDailyAdsModel
        .findById(existing._id)
        .populate("channel")
        .exec()

      return populated as unknown as ShopeeDailyAds
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi cập nhật chi phí ads Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteShopeeDailyAds(id: string): Promise<void> {
    try {
      if (!Types.ObjectId.isValid(id)) {
        throw new HttpException("ID không hợp lệ", HttpStatus.BAD_REQUEST)
      }

      const deleted = await this.shopeeDailyAdsModel.findByIdAndDelete(id).exec()
      if (!deleted) {
        throw new HttpException(
          "Không tìm thấy chi phí ads Shopee",
          HttpStatus.NOT_FOUND
        )
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi xóa chi phí ads Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteShopeeDailyAdsByDateAndChannel(
    date: string,
    channelId: string
  ): Promise<ShopeeDailyAds> {
    try {
      if (!date || !date.trim()) {
        throw new HttpException(
          "Ngày là bắt buộc",
          HttpStatus.BAD_REQUEST
        )
      }

      const normalizedDate = this.parseAndNormalizeDate(date.trim())
      const channel = await this.getShopeeLivestreamChannelOrThrow(channelId)

      const deleted = await this.shopeeDailyAdsModel
        .findOneAndDelete({
          date: normalizedDate,
          channel: channel._id
        })
        .exec()

      if (!deleted) {
        throw new HttpException(
          "Không tìm thấy chi phí ads Shopee",
          HttpStatus.NOT_FOUND
        )
      }

      return deleted
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Lỗi khi xóa chi phí ads Shopee",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
