import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { MonthGoal } from "../database/mongoose/schemas/MonthGoal"
import { CreateMonthGoalDto, UpdateMonthGoalDto } from "./dto/monthgoals.dto"
import { IncomeService } from "../income/income.service"

@Injectable()
export class MonthGoalService {
  constructor(
    @InjectModel("MonthGoal")
    private readonly monthGoalModel: Model<MonthGoal>,
    private readonly incomeService: IncomeService
  ) {}

  async createGoal(dto: CreateMonthGoalDto): Promise<MonthGoal> {
    try {
      const filter: any = {
        month: dto.month,
        year: dto.year
      }
      if (dto.channel) filter.channel = dto.channel

      const existed = await this.monthGoalModel.findOne(filter)
      if (existed)
        throw new HttpException(
          "Đã có KPI cho tháng/năm/channel này",
          HttpStatus.CONFLICT
        )

      const goal = new this.monthGoalModel({
        month: dto.month,
        year: dto.year,
        channel: dto.channel,
        liveStreamGoal: dto.liveStreamGoal,
        shopGoal: dto.shopGoal,
        liveAdsPercentageGoal: dto.liveAdsPercentageGoal,
        shopAdsPercentageGoal: dto.shopAdsPercentageGoal
      })
      return await goal.save()
    } catch (error) {
      throw error instanceof HttpException
        ? error
        : new HttpException(
            "Internal server error",
            HttpStatus.INTERNAL_SERVER_ERROR
          )
    }
  }

  async getGoal(
    month: number,
    year: number,
    channelId?: string
  ): Promise<MonthGoal | null> {
    const filter: any = { month, year }
    if (channelId) filter.channel = channelId
    return this.monthGoalModel.findOne(filter).lean()
  }

  async getGoals(
    year?: number,
    channelId?: string
  ): Promise<{
    monthGoals: {
      month: number
      year: number
      channel?: any
      liveStreamGoal: number
      shopGoal: number
      liveAdsPercentageGoal: number
      shopAdsPercentageGoal: number
      totalIncome: {
        beforeDiscount: { live: number; shop: number }
        afterDiscount: { live: number; shop: number }
      }
      totalQuantity: { live: number; shop: number }
      KPIPercentage: {
        beforeDiscount: { live: number; shop: number }
        afterDiscount: { live: number; shop: number }
      }
      adsPercentage: { live: number; shop: number }
      adsGoalComparison: { live: number; shop: number }
    }[]
    total: number
  }> {
    let monthGoals: MonthGoal[] = []
    let total: number = 0

    const filter: any = {}
    if (year) filter.year = year
    if (channelId) filter.channel = channelId

    if (year) {
      ;[monthGoals, total] = await Promise.all([
        this.monthGoalModel
          .find(filter)
          .populate("channel", "_id name")
          .sort({ month: 1 })
          .lean(),
        this.monthGoalModel.countDocuments(filter).exec()
      ])
    } else {
      ;[monthGoals, total] = await Promise.all([
        this.monthGoalModel
          .find(filter)
          .populate("channel", "_id name")
          .sort({ year: -1, month: 1 })
          .lean(),
        this.monthGoalModel.countDocuments(filter).exec()
      ])
    }

    const results = await Promise.all(
      monthGoals.map(async (goal) => {
        const goalChannelId = goal.channel
          ? String((goal.channel as any)._id || goal.channel)
          : undefined

        const [incomeSplit, quantitySplit, adsSplit] = await Promise.all([
          this.incomeService.totalIncomeByMonthSplit(
            goal.month,
            goal.year,
            goalChannelId
          ),
          this.incomeService.totalQuantityByMonthSplit(
            goal.month,
            goal.year,
            goalChannelId
          ),
          this.incomeService.adsCostSplitByMonth(
            goal.month,
            goal.year,
            goalChannelId
          )
        ])

        // Build KPIPercentage for before and after discount using goals
        const buildKPI = (liveValue: number, shopValue: number) => ({
          live:
            goal.liveStreamGoal === 0
              ? 0
              : Math.min(
                  Math.round((liveValue / goal.liveStreamGoal) * 10000) / 100,
                  999
                ),
          shop:
            goal.shopGoal === 0
              ? 0
              : Math.min(
                  Math.round((shopValue / goal.shopGoal) * 10000) / 100,
                  999
                )
        })

        const kpiSplit = {
          beforeDiscount: buildKPI(
            incomeSplit.beforeDiscount.live,
            incomeSplit.beforeDiscount.shop
          ),
          afterDiscount: buildKPI(
            incomeSplit.afterDiscount.live,
            incomeSplit.afterDiscount.shop
          )
        }

        const adsPercentage = {
          live: adsSplit.percentages.liveAdsToLiveIncome,
          shop: adsSplit.percentages.shopAdsToShopIncome
        }

        const adsGoalComparison = {
          live:
            goal.liveAdsPercentageGoal === 0
              ? 0
              : Math.round(
                  (adsPercentage.live / goal.liveAdsPercentageGoal) * 10000
                ) / 100,
          shop:
            goal.shopAdsPercentageGoal === 0
              ? 0
              : Math.round(
                  (adsPercentage.shop / goal.shopAdsPercentageGoal) * 10000
                ) / 100
        }

        return {
          month: goal.month,
          year: goal.year,
          channel: goal.channel,
          liveStreamGoal: goal.liveStreamGoal,
          shopGoal: goal.shopGoal,
          liveAdsPercentageGoal: goal.liveAdsPercentageGoal,
          shopAdsPercentageGoal: goal.shopAdsPercentageGoal,
          totalIncome: incomeSplit,
          totalQuantity: quantitySplit,
          KPIPercentage: kpiSplit,
          adsPercentage,
          adsGoalComparison
        }
      })
    )

    return { monthGoals: results, total }
  }

  async updateGoal(
    month: number,
    year: number,
    dto: UpdateMonthGoalDto,
    channelId?: string
  ): Promise<MonthGoal> {
    const filter: any = { month, year }
    if (channelId) filter.channel = channelId

    const updated = await this.monthGoalModel.findOneAndUpdate(
      filter,
      {
        $set: {
          channel: dto.channel,
          liveStreamGoal: dto.liveStreamGoal,
          shopGoal: dto.shopGoal,
          liveAdsPercentageGoal: dto.liveAdsPercentageGoal,
          shopAdsPercentageGoal: dto.shopAdsPercentageGoal
        }
      },
      { new: true }
    )
    if (!updated)
      throw new HttpException("Không tìm thấy KPI", HttpStatus.NOT_FOUND)
    return updated
  }

  async deleteGoal(
    month: number,
    year: number,
    channelId?: string
  ): Promise<void> {
    const filter: any = { month, year }
    if (channelId) filter.channel = channelId

    const deleted = await this.monthGoalModel.findOneAndDelete(filter)
    if (!deleted)
      throw new HttpException("Không tìm thấy KPI", HttpStatus.NOT_FOUND)
  }
}
