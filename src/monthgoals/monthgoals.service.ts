import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { MonthGoal } from "../database/mongoose/schemas/MonthGoal"
import { CreateMonthGoalDto, UpdateMonthGoalDto } from "./dto/monthgoals.dto"

@Injectable()
export class MonthGoalService {
  constructor(
    @InjectModel("MonthGoal")
    private readonly monthGoalModel: Model<MonthGoal>
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

  async getGoals(
    year?: number,
    page = 1,
    limit = 10
  ): Promise<{ monthGoals: MonthGoal[]; total: number }> {
    if (year) {
      const [monthGoals, total] = await Promise.all([
        this.monthGoalModel
          .find({ year })
          .sort({ month: 1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .lean(),
        this.monthGoalModel.countDocuments({ year }).exec()
      ])
      return { monthGoals, total }
    }
    const [monthGoals, total] = await Promise.all([
      this.monthGoalModel
        .find({})
        .sort({ year: -1, month: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.monthGoalModel.countDocuments().exec()
    ])
    return { monthGoals, total }
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
