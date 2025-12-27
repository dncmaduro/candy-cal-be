import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { LivestreamPerformance } from "../database/mongoose/schemas/LivestreamPerformance"
import { Livestream } from "../database/mongoose/schemas/Livestream"
import { User } from "../database/mongoose/schemas/User"

@Injectable()
export class LivestreamperformanceService {
  constructor(
    @InjectModel("LivestreamPerformance")
    private readonly performanceModel: Model<LivestreamPerformance>,
    @InjectModel("livestreams")
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel("users")
    private readonly userModel: Model<User>
  ) {}

  // Helper: Check if income ranges overlap
  private rangesOverlap(
    min1: number,
    max1: number,
    min2: number,
    max2: number
  ): boolean {
    // Two ranges overlap if: min1 < max2 AND min2 < max1
    return min1 < max2 && min2 < max1
  }

  // Helper: Validate no overlapping ranges exist (excluding current ID for updates)
  private async validateNoOverlap(
    minIncome: number,
    maxIncome: number,
    excludeId?: string
  ): Promise<void> {
    const filter: any = {}
    if (excludeId) {
      filter._id = { $ne: excludeId }
    }

    const existingPerformances = await this.performanceModel.find(filter).exec()

    for (const perf of existingPerformances) {
      if (
        this.rangesOverlap(minIncome, maxIncome, perf.minIncome, perf.maxIncome)
      ) {
        throw new HttpException(
          `Income range [${minIncome}, ${maxIncome}) overlaps with existing range [${perf.minIncome}, ${perf.maxIncome})`,
          HttpStatus.BAD_REQUEST
        )
      }
    }
  }

  // 1. Create performance
  async createPerformance(payload: {
    minIncome: number
    maxIncome: number
    salaryPerHour: number
    bonusPercentage: number
  }): Promise<LivestreamPerformance> {
    try {
      // Validate input
      if (payload.minIncome >= payload.maxIncome) {
        throw new HttpException(
          "minIncome must be less than maxIncome",
          HttpStatus.BAD_REQUEST
        )
      }

      // Check for overlapping ranges
      await this.validateNoOverlap(payload.minIncome, payload.maxIncome)

      const created = new this.performanceModel(payload)
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

  // 2. Update performance
  async updatePerformance(
    id: string,
    payload: {
      minIncome?: number
      maxIncome?: number
      salaryPerHour?: number
      bonusPercentage?: number
    }
  ): Promise<LivestreamPerformance> {
    try {
      const performance = await this.performanceModel.findById(id).exec()
      if (!performance) {
        throw new HttpException("Performance not found", HttpStatus.NOT_FOUND)
      }

      // Get final values (use existing if not provided)
      const finalMinIncome = payload.minIncome ?? performance.minIncome
      const finalMaxIncome = payload.maxIncome ?? performance.maxIncome

      // Validate income range
      if (finalMinIncome >= finalMaxIncome) {
        throw new HttpException(
          "minIncome must be less than maxIncome",
          HttpStatus.BAD_REQUEST
        )
      }

      // Check for overlapping ranges (excluding current record)
      await this.validateNoOverlap(finalMinIncome, finalMaxIncome, id)

      // Update fields
      if (payload.minIncome !== undefined)
        performance.minIncome = payload.minIncome
      if (payload.maxIncome !== undefined)
        performance.maxIncome = payload.maxIncome
      if (payload.salaryPerHour !== undefined)
        performance.salaryPerHour = payload.salaryPerHour
      if (payload.bonusPercentage !== undefined)
        performance.bonusPercentage = payload.bonusPercentage

      return await performance.save()
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 3. Search performances (sorted by salaryPerHour)
  async searchPerformances(
    page = 1,
    limit = 10,
    sortOrder: "asc" | "desc" = "asc"
  ): Promise<{ data: LivestreamPerformance[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)
      const skip = (safePage - 1) * safeLimit

      const sortDirection = sortOrder === "desc" ? -1 : 1

      const [data, total] = await Promise.all([
        this.performanceModel
          .find()
          .sort({ salaryPerHour: sortDirection })
          .skip(skip)
          .limit(safeLimit)
          .exec(),
        this.performanceModel.countDocuments().exec()
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

  // 4. Delete performance
  async deletePerformance(id: string): Promise<void> {
    try {
      const result = await this.performanceModel.findByIdAndDelete(id).exec()
      if (!result) {
        throw new HttpException("Performance not found", HttpStatus.NOT_FOUND)
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

  // 5. Find performance by income
  async findPerformanceByIncome(
    income: number
  ): Promise<LivestreamPerformance | null> {
    try {
      // Find performance where income >= minIncome AND income < maxIncome
      const performance = await this.performanceModel
        .findOne({
          minIncome: { $lte: income },
          maxIncome: { $gt: income }
        })
        .exec()

      return performance
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // 6. Calculate and save performance for all snapshots in a date
  async calculateDailyPerformance(date: Date): Promise<{
    livestreamId: string
    date: Date
    snapshotsUpdated: number
    snapshotsSkipped: number
    details: Array<{
      snapshotId: string
      income: number
      salaryPerHour: number
      bonusPercentage: number
      total: number
      status: "updated" | "skipped" | "no_performance_found"
    }>
  }> {
    try {
      // Find livestream by date
      const startOfDay = new Date(date)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setHours(23, 59, 59, 999)

      const livestream = await this.livestreamModel
        .findOne({
          date: {
            $gte: startOfDay,
            $lte: endOfDay
          }
        })
        .exec()

      if (!livestream) {
        throw new HttpException(
          "Livestream not found for this date",
          HttpStatus.NOT_FOUND
        )
      }

      let snapshotsUpdated = 0
      let snapshotsSkipped = 0
      const details: Array<{
        snapshotId: string
        income: number
        salaryPerHour: number
        bonusPercentage: number
        total: number
        status: "updated" | "skipped" | "no_performance_found"
      }> = []

      // Process each snapshot
      for (const snapshot of livestream.snapshots) {
        // Use realIncome if available, otherwise use income
        const incomeValue = (snapshot as any).realIncome ?? snapshot.income

        if (!incomeValue || incomeValue === 0) {
          snapshotsSkipped++
          details.push({
            snapshotId: snapshot._id?.toString() || "",
            income: incomeValue || 0,
            salaryPerHour: 0,
            bonusPercentage: 0,
            total: 0,
            status: "skipped"
          })
          continue
        }

        // Find matching performance
        const performance = await this.findPerformanceByIncome(incomeValue)

        if (!performance) {
          snapshotsSkipped++
          details.push({
            snapshotId: snapshot._id?.toString() || "",
            income: incomeValue,
            salaryPerHour: 0,
            bonusPercentage: 0,
            total: 0,
            status: "no_performance_found"
          })
          continue
        }

        // Calculate duration in hours
        const periodStartMinutes =
          (snapshot as any).period.startTime.hour * 60 +
          (snapshot as any).period.startTime.minute
        const periodEndMinutes =
          (snapshot as any).period.endTime.hour * 60 +
          (snapshot as any).period.endTime.minute
        const durationMinutes = periodEndMinutes - periodStartMinutes
        const durationHours = durationMinutes / 60

        // Calculate total salary
        const baseSalary = performance.salaryPerHour * durationHours
        const bonus = (incomeValue * performance.bonusPercentage) / 100
        const totalSalary = baseSalary + bonus

        // Update snapshot salary
        ;(snapshot as any).salary = {
          salaryPerHour: performance.salaryPerHour,
          bonusPercentage: performance.bonusPercentage,
          total: Math.round(totalSalary)
        }

        snapshotsUpdated++
        details.push({
          snapshotId: snapshot._id?.toString() || "",
          income: incomeValue,
          salaryPerHour: performance.salaryPerHour,
          bonusPercentage: performance.bonusPercentage,
          total: Math.round(totalSalary),
          status: "updated"
        })
      }

      // Save livestream with updated snapshots
      await livestream.save()

      return {
        livestreamId: livestream._id.toString(),
        date: livestream.date,
        snapshotsUpdated,
        snapshotsSkipped,
        details
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

  // 7. Calculate monthly salary for all users
  async calculateMonthlySalary(
    year: number,
    month: number
  ): Promise<{
    year: number
    month: number
    users: Array<{
      userId: string
      userName: string
      totalSalary: number
      snapshotsCount: number
    }>
    totalSalaryPaid: number
  }> {
    try {
      // Validate year and month
      if (month < 1 || month > 12) {
        throw new HttpException(
          "Invalid month. Must be between 1 and 12",
          HttpStatus.BAD_REQUEST
        )
      }

      // Get start and end date of the month
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59, 999)

      // Find all livestreams in the month
      const livestreams = await this.livestreamModel
        .find({
          date: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .exec()

      // Map to store salary per user
      const userSalaryMap = new Map<
        string,
        { userName: string; totalSalary: number; snapshotsCount: number }
      >()

      // Process each livestream
      for (const livestream of livestreams) {
        for (const snapshot of livestream.snapshots) {
          const salary = (snapshot as any).salary

          // Skip if no salary calculated
          if (!salary || !salary.total) {
            continue
          }

          let targetUserId: string | null = null

          // Logic to determine who gets the salary
          if ((snapshot as any).altAssignee) {
            // Case 2 & 3: Has altAssignee
            if ((snapshot as any).altAssignee === "other") {
              // Case 3: altAssignee is "other" - no one gets paid
              continue
            } else {
              // Case 2: altAssignee is a user ID - they get paid
              targetUserId = (snapshot as any).altAssignee.toString()
            }
          } else if (snapshot.assignee) {
            // Case 1: No altAssignee - assignee gets paid
            targetUserId = snapshot.assignee.toString()
          } else {
            // No assignee at all - skip
            continue
          }

          // Add salary to the target user
          if (targetUserId) {
            if (!userSalaryMap.has(targetUserId)) {
              // Fetch user info if first time seeing this user
              const user = await this.userModel.findById(targetUserId).exec()
              const userName = user
                ? user.name || user.username || "Unknown"
                : "Unknown"

              userSalaryMap.set(targetUserId, {
                userName,
                totalSalary: 0,
                snapshotsCount: 0
              })
            }

            const userSalary = userSalaryMap.get(targetUserId)!
            userSalary.totalSalary += salary.total
            userSalary.snapshotsCount += 1
          }
        }
      }

      // Convert map to array
      const users = Array.from(userSalaryMap.entries()).map(
        ([userId, data]) => ({
          userId,
          userName: data.userName,
          totalSalary: Math.round(data.totalSalary),
          snapshotsCount: data.snapshotsCount
        })
      )

      // Sort by totalSalary descending
      users.sort((a, b) => b.totalSalary - a.totalSalary)

      // Calculate total salary paid
      const totalSalaryPaid = users.reduce(
        (sum, user) => sum + user.totalSalary,
        0
      )

      return {
        year,
        month,
        users,
        totalSalaryPaid
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
}
