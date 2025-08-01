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

      const goal = new this.monthGoalModel(dto)
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
      goal: number
      totalIncome: number
      totalQuantity: number
      KPIPercentage: number
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
        const [totalIncome, totalQuantity, KPIPercentage] = await Promise.all([
          this.incomeService.totalIncomeByMonth(goal.month),
          this.incomeService.totalQuantityByMonth(goal.month),
          this.incomeService.KPIPercentageByMonth(goal.month, goal.year)
        ])
        return {
          ...goal,
          totalIncome,
          totalQuantity,
          KPIPercentage
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
      { $set: dto },
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
