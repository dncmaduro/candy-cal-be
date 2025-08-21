import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import { DailyAdsDto } from "./dto/dailyads.dto"

@Injectable()
export class DailyAdsService {
  constructor(
    @InjectModel("dailyads")
    private readonly dailyAdsModel: Model<DailyAds>
  ) {}

  async createOrUpdateDailyAds(dto: DailyAdsDto): Promise<void> {
    try {
      const filter = { date: dto.date }
      const update = { ...dto, updatedAt: new Date() }
      await this.dailyAdsModel.findOneAndUpdate(filter, update, {
        upsert: true,
        new: true
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tạo/cập nhật quảng cáo ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
