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
      const existed = await this.monthGoalModel.findOne({
        month: dto.month,
        year: dto.year
      })
      if (existed)
        throw new HttpException(
          "Đã có KPI cho tháng/năm này",
          HttpStatus.CONFLICT
        )

      const goal = new this.monthGoalModel({
        month: dto.month,
        year: dto.year,
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

  async getGoal(month: number, year: number): Promise<MonthGoal | null> {
    return this.monthGoalModel.findOne({ month, year }).lean()
  }

  async getGoals(year?: number): Promise<{
    monthGoals: {
      month: number
      year: number
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

    if (year) {
      ;[monthGoals, total] = await Promise.all([
        this.monthGoalModel.find({ year }).sort({ month: 1 }).lean(),
        this.monthGoalModel.countDocuments({ year }).exec()
      ])
    } else {
      ;[monthGoals, total] = await Promise.all([
        this.monthGoalModel.find({}).sort({ year: -1, month: 1 }).lean(),
        this.monthGoalModel.countDocuments().exec()
      ])
    }

    const results = await Promise.all(
      monthGoals.map(async (goal) => {
        const [incomeSplit, quantitySplit, adsSplit] = await Promise.all([
          this.incomeService.totalIncomeByMonthSplit(goal.month, goal.year),
          this.incomeService.totalQuantityByMonthSplit(goal.month, goal.year),
          this.incomeService.adsCostSplitByMonth(goal.month, goal.year)
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
    dto: UpdateMonthGoalDto
  ): Promise<MonthGoal> {
    const updated = await this.monthGoalModel.findOneAndUpdate(
      { month, year },
      {
        $set: {
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

  async deleteGoal(month: number, year: number): Promise<void> {
    const deleted = await this.monthGoalModel.findOneAndDelete({ month, year })
    if (!deleted)
      throw new HttpException("Không tìm thấy KPI", HttpStatus.NOT_FOUND)
  }
}
