import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { LivestreamSalary } from "../database/mongoose/schemas/LivestreamSalary"
import { LivestreamPerformance } from "../database/mongoose/schemas/LivestreamPerformance"
import { User } from "../database/mongoose/schemas/User"

@Injectable()
export class LivestreamsalaryService {
  constructor(
    @InjectModel("LivestreamSalary")
    private readonly salaryModel: Model<LivestreamSalary>,
    @InjectModel("LivestreamPerformance")
    private readonly performanceModel: Model<LivestreamPerformance>,
    @InjectModel("users")
    private readonly userModel: Model<User>
  ) {}

  // Helper: Validate that performance IDs exist
  private async validatePerformanceIds(
    performanceIds: string[]
  ): Promise<void> {
    const performances = await this.performanceModel
      .find({
        _id: { $in: performanceIds.map((id) => new Types.ObjectId(id)) }
      })
      .exec()

    if (performances.length !== performanceIds.length) {
      throw new HttpException(
        "One or more performance IDs are invalid",
        HttpStatus.BAD_REQUEST
      )
    }
  }

  // Helper: Validate that user IDs exist
  private async validateUserIds(userIds: string[]): Promise<void> {
    const users = await this.userModel
      .find({
        _id: { $in: userIds.map((id) => new Types.ObjectId(id)) }
      })
      .exec()

    if (users.length !== userIds.length) {
      throw new HttpException(
        "One or more user IDs are invalid",
        HttpStatus.BAD_REQUEST
      )
    }
  }

  // Helper: Validate no income range overlap within a salary's performances
  private async validateNoOverlapInSalary(
    performanceIds: string[]
  ): Promise<void> {
    const performances = await this.performanceModel
      .find({
        _id: { $in: performanceIds.map((id) => new Types.ObjectId(id)) }
      })
      .exec()

    // Check for overlaps
    for (let i = 0; i < performances.length; i++) {
      for (let j = i + 1; j < performances.length; j++) {
        const perf1 = performances[i]
        const perf2 = performances[j]

        // Two ranges overlap if: min1 < max2 AND min2 < max1
        const overlaps =
          perf1.minIncome < perf2.maxIncome && perf2.minIncome < perf1.maxIncome

        if (overlaps) {
          throw new HttpException(
            `Income ranges overlap: [${perf1.minIncome}, ${perf1.maxIncome}) and [${perf2.minIncome}, ${perf2.maxIncome})`,
            HttpStatus.BAD_REQUEST
          )
        }
      }
    }
  }

  // 1. Create salary configuration
  async createSalary(payload: {
    name: string
    livestreamPerformances: string[]
    livestreamEmployees: string[]
  }): Promise<LivestreamSalary> {
    try {
      // Validate inputs
      if (!payload.name || payload.name.trim().length === 0) {
        throw new HttpException("Name is required", HttpStatus.BAD_REQUEST)
      }

      if (
        !payload.livestreamPerformances ||
        payload.livestreamPerformances.length === 0
      ) {
        throw new HttpException(
          "At least one performance must be provided",
          HttpStatus.BAD_REQUEST
        )
      }

      if (
        !payload.livestreamEmployees ||
        payload.livestreamEmployees.length === 0
      ) {
        throw new HttpException(
          "At least one employee must be provided",
          HttpStatus.BAD_REQUEST
        )
      }

      // Check if name already exists
      const existingName = await this.salaryModel
        .findOne({ name: payload.name.trim() })
        .exec()

      if (existingName) {
        throw new HttpException(
          `A salary configuration with name "${payload.name}" already exists`,
          HttpStatus.BAD_REQUEST
        )
      }

      // Validate that all performance IDs exist
      await this.validatePerformanceIds(payload.livestreamPerformances)

      // Validate that all user IDs exist
      await this.validateUserIds(payload.livestreamEmployees)

      // Validate no overlap within the salary's performances
      await this.validateNoOverlapInSalary(payload.livestreamPerformances)

      // Check that users are not already in another salary
      for (const userId of payload.livestreamEmployees) {
        const existingSalary = await this.salaryModel
          .findOne({
            livestreamEmployees: new Types.ObjectId(userId)
          })
          .exec()

        if (existingSalary) {
          const user = await this.userModel.findById(userId).exec()
          throw new HttpException(
            `User ${user?.name || userId} is already assigned to another salary configuration`,
            HttpStatus.BAD_REQUEST
          )
        }
      }

      const created = new this.salaryModel({
        name: payload.name.trim(),
        livestreamPerformances: payload.livestreamPerformances.map(
          (id) => new Types.ObjectId(id)
        ),
        livestreamEmployees: payload.livestreamEmployees.map(
          (id) => new Types.ObjectId(id)
        )
      })

      return await created.save()
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 2. Update salary configuration
  async updateSalary(
    id: string,
    payload: {
      name?: string
      livestreamPerformances?: string[]
      livestreamEmployees?: string[]
    }
  ): Promise<LivestreamSalary> {
    try {
      const salary = await this.salaryModel.findById(id).exec()
      if (!salary) {
        throw new HttpException(
          "Salary configuration not found",
          HttpStatus.NOT_FOUND
        )
      }

      // Validate and update name if provided
      if (payload.name !== undefined) {
        if (payload.name.trim().length === 0) {
          throw new HttpException(
            "Name cannot be empty",
            HttpStatus.BAD_REQUEST
          )
        }

        // Check if name already exists (excluding current)
        const existingName = await this.salaryModel
          .findOne({
            name: payload.name.trim(),
            _id: { $ne: id }
          })
          .exec()

        if (existingName) {
          throw new HttpException(
            `A salary configuration with name "${payload.name}" already exists`,
            HttpStatus.BAD_REQUEST
          )
        }

        salary.name = payload.name.trim()
      }

      // Validate performance IDs if provided
      if (payload.livestreamPerformances) {
        if (payload.livestreamPerformances.length === 0) {
          throw new HttpException(
            "At least one performance must be provided",
            HttpStatus.BAD_REQUEST
          )
        }
        await this.validatePerformanceIds(payload.livestreamPerformances)
        await this.validateNoOverlapInSalary(payload.livestreamPerformances)

        salary.livestreamPerformances = payload.livestreamPerformances.map(
          (id) => new Types.ObjectId(id)
        )
      }

      // Validate user IDs if provided
      if (payload.livestreamEmployees) {
        if (payload.livestreamEmployees.length === 0) {
          throw new HttpException(
            "At least one employee must be provided",
            HttpStatus.BAD_REQUEST
          )
        }
        await this.validateUserIds(payload.livestreamEmployees)

        // Check that new users are not already in another salary (excluding current)
        for (const userId of payload.livestreamEmployees) {
          const existingSalary = await this.salaryModel
            .findOne({
              _id: { $ne: id },
              livestreamEmployees: new Types.ObjectId(userId)
            })
            .exec()

          if (existingSalary) {
            const user = await this.userModel.findById(userId).exec()
            throw new HttpException(
              `User ${user?.name || userId} is already assigned to another salary configuration`,
              HttpStatus.BAD_REQUEST
            )
          }
        }

        salary.livestreamEmployees = payload.livestreamEmployees.map(
          (id) => new Types.ObjectId(id)
        )
      }

      return await salary.save()
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 3. Search salary configurations
  async searchSalaries(
    page = 1,
    limit = 10
  ): Promise<{ data: LivestreamSalary[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)
      const skip = (safePage - 1) * safeLimit

      const [data, total] = await Promise.all([
        this.salaryModel
          .find()
          .populate("livestreamPerformances")
          .populate("livestreamEmployees", "name email")
          .skip(skip)
          .limit(safeLimit)
          .exec(),
        this.salaryModel.countDocuments().exec()
      ])

      return { data, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 4. Delete salary configuration
  async deleteSalary(id: string): Promise<void> {
    try {
      const result = await this.salaryModel.findByIdAndDelete(id).exec()
      if (!result) {
        throw new HttpException(
          "Salary configuration not found",
          HttpStatus.NOT_FOUND
        )
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 5. Find salary configuration by user ID
  async findSalaryByUserId(userId: string): Promise<LivestreamSalary | null> {
    try {
      const salary = await this.salaryModel
        .findOne({
          livestreamEmployees: new Types.ObjectId(userId)
        })
        .populate("livestreamPerformances")
        .exec()

      return salary
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 6. Get salary configuration by ID
  async getSalaryById(id: string): Promise<LivestreamSalary> {
    try {
      const salary = await this.salaryModel
        .findById(id)
        .populate("livestreamPerformances")
        .populate("livestreamEmployees", "name email")
        .exec()

      if (!salary) {
        throw new HttpException(
          "Salary configuration not found",
          HttpStatus.NOT_FOUND
        )
      }

      return salary
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
