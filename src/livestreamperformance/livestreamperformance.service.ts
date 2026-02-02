import { Injectable, HttpException, HttpStatus } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { LivestreamPerformance } from "../database/mongoose/schemas/LivestreamPerformance"
import { Livestream } from "../database/mongoose/schemas/Livestream"
import { User } from "../database/mongoose/schemas/User"
import { LivestreamSalary } from "../database/mongoose/schemas/LivestreamSalary"
import * as XLSX from "xlsx"
import * as ExcelJS from "exceljs"

@Injectable()
export class LivestreamperformanceService {
  constructor(
    @InjectModel("LivestreamPerformance")
    private readonly performanceModel: Model<LivestreamPerformance>,
    @InjectModel("livestreams")
    private readonly livestreamModel: Model<Livestream>,
    @InjectModel("users")
    private readonly userModel: Model<User>,
    @InjectModel("LivestreamSalary")
    private readonly salaryModel: Model<LivestreamSalary>
  ) {}

  // Helper: Validate global uniqueness (all fields must match to be duplicate)
  private async validateGlobalUniqueness(
    minIncome: number,
    maxIncome: number,
    salaryPerHour: number,
    bonusPercentage: number,
    excludeId?: string
  ): Promise<void> {
    const filter: any = {
      minIncome,
      maxIncome,
      salaryPerHour,
      bonusPercentage
    }
    if (excludeId) {
      filter._id = { $ne: excludeId }
    }

    const existingPerformance = await this.performanceModel
      .findOne(filter)
      .exec()

    if (existingPerformance) {
      throw new HttpException(
        `A performance with these exact specifications already exists: minIncome=${minIncome}, maxIncome=${maxIncome}, salaryPerHour=${salaryPerHour}, bonusPercentage=${bonusPercentage}`,
        HttpStatus.BAD_REQUEST
      )
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

      // Check for global uniqueness (all fields must be unique)
      await this.validateGlobalUniqueness(
        payload.minIncome,
        payload.maxIncome,
        payload.salaryPerHour,
        payload.bonusPercentage
      )

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
      const finalSalaryPerHour =
        payload.salaryPerHour ?? performance.salaryPerHour
      const finalBonusPercentage =
        payload.bonusPercentage ?? performance.bonusPercentage

      // Validate income range
      if (finalMinIncome >= finalMaxIncome) {
        throw new HttpException(
          "minIncome must be less than maxIncome",
          HttpStatus.BAD_REQUEST
        )
      }

      // Check for global uniqueness (excluding current record)
      await this.validateGlobalUniqueness(
        finalMinIncome,
        finalMaxIncome,
        finalSalaryPerHour,
        finalBonusPercentage,
        id
      )

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
  async calculateDailyPerformance(
    date: Date,
    baseOnRealIncome?: boolean
  ): Promise<{
    livestreamId: string
    date: Date
    snapshotsUpdated: number
    snapshotsSkipped: number
    details: Array<{
      snapshotId: string
      userId: string
      userName: string
      income: number
      salaryPerHour: number
      bonusPercentage: number
      total: number
      status:
        | "updated"
        | "skipped"
        | "no_performance_found"
        | "no_salary_config"
    }>
  }> {
    try {
      date.setUTCHours(date.getUTCHours() + 7)
      const startOfDay = new Date(date)
      startOfDay.setUTCHours(0, 0, 0, 0)
      const endOfDay = new Date(date)
      endOfDay.setUTCHours(23, 59, 59, 999)

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
        userId: string
        userName: string
        income: number
        salaryPerHour: number
        bonusPercentage: number
        total: number
        status:
          | "updated"
          | "skipped"
          | "no_performance_found"
          | "no_salary_config"
      }> = []

      // Process each snapshot
      for (const snapshot of livestream.snapshots) {
        // Determine income value based on baseOnRealIncome parameter
        let incomeValue: number
        if (baseOnRealIncome === true) {
          // Use realIncome only (even if 0)
          incomeValue = snapshot.realIncome ?? 0
        } else {
          // Use realIncome if available, otherwise use income (default behavior)
          incomeValue = snapshot.realIncome ?? snapshot.income
        }

        console.log(snapshot, incomeValue)

        if (!incomeValue || incomeValue === 0) {
          snapshotsSkipped++
          details.push({
            snapshotId: snapshot._id?.toString() || "",
            userId: snapshot.assignee?.toString() || "",
            userName: "",
            income: incomeValue || 0,
            salaryPerHour: 0,
            bonusPercentage: 0,
            total: 0,
            status: "skipped"
          })
          continue
        }

        // Determine which user to calculate salary for
        let targetUserId: Types.ObjectId | null = null
        if ((snapshot as any).altAssignee) {
          const altAssignee = (snapshot as any).altAssignee
          if (altAssignee !== "other") {
            targetUserId = altAssignee
          }
        } else if (snapshot.assignee) {
          targetUserId = snapshot.assignee as Types.ObjectId
        }

        if (!targetUserId) {
          snapshotsSkipped++
          details.push({
            snapshotId: snapshot._id?.toString() || "",
            userId: "",
            userName: "",
            income: incomeValue,
            salaryPerHour: 0,
            bonusPercentage: 0,
            total: 0,
            status: "skipped"
          })
          continue
        }

        // Find the salary configuration for this user
        const salaryConfig = await this.salaryModel
          .findOne({
            livestreamEmployees: targetUserId
          })
          .populate("livestreamPerformances")
          .exec()

        if (!salaryConfig) {
          snapshotsSkipped++
          const user = await this.userModel.findById(targetUserId).exec()
          details.push({
            snapshotId: snapshot._id?.toString() || "",
            userId: targetUserId.toString(),
            userName: user?.name || "",
            income: incomeValue,
            salaryPerHour: 0,
            bonusPercentage: 0,
            total: 0,
            status: "no_salary_config"
          })
          continue
        }

        // Find matching performance from the salary's performances
        let matchingPerformance: any = null
        for (const perfId of salaryConfig.livestreamPerformances) {
          const perf = await this.performanceModel.findById(perfId).exec()
          if (
            perf &&
            incomeValue >= perf.minIncome &&
            incomeValue < perf.maxIncome
          ) {
            matchingPerformance = perf
            break
          }
        }

        if (!matchingPerformance) {
          snapshotsSkipped++
          const user = await this.userModel.findById(targetUserId).exec()
          details.push({
            snapshotId: snapshot._id?.toString() || "",
            userId: targetUserId.toString(),
            userName: user?.name || "",
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
        const baseSalary = matchingPerformance.salaryPerHour * durationHours
        const bonus = (incomeValue * matchingPerformance.bonusPercentage) / 100
        const totalSalary = baseSalary + bonus

        // Update snapshot salary
        ;(snapshot as any).salary = {
          salaryPerHour: matchingPerformance.salaryPerHour,
          bonusPercentage: matchingPerformance.bonusPercentage,
          total: Math.round(totalSalary)
        }

        snapshotsUpdated++
        const user = await this.userModel.findById(targetUserId).exec()
        details.push({
          snapshotId: snapshot._id?.toString() || "",
          userId: targetUserId.toString(),
          userName: user?.name || "",
          income: incomeValue,
          salaryPerHour: matchingPerformance.salaryPerHour,
          bonusPercentage: matchingPerformance.bonusPercentage,
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
    month: number,
    channelId?: string
  ): Promise<{
    year: number
    month: number
    channelId?: string
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
          // Filter by channelId if provided
          if (channelId) {
            const snapshotChannelId = (
              snapshot as any
            ).period?.channel?.toString()
            if (snapshotChannelId !== channelId) {
              continue
            }
          }

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

      const result: any = {
        year,
        month,
        users,
        totalSalaryPaid
      }

      // Include channelId in response if provided
      if (channelId) {
        result.channelId = channelId
      }

      return result
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async exportMonthlySalaryToXlsx(
    year: number,
    month: number,
    channelId?: string
  ): Promise<Buffer> {
    try {
      if (month < 1 || month > 12) {
        throw new HttpException(
          "Invalid month. Must be between 1 and 12",
          HttpStatus.BAD_REQUEST
        )
      }

      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0, 23, 59, 59, 999)
      const daysInMonth = new Date(year, month, 0).getDate()

      const livestreams = await this.livestreamModel
        .find({
          date: {
            $gte: startDate,
            $lte: endDate
          }
        })
        .sort({ date: 1, _id: 1 })
        .lean()

      type UserAcc = {
        userName: string
        totalSalary: number
        snapshotsCount: number
        dailySalary: number[]
        dailySnapshotsCount: number[]
      }

      const userSalaryMap = new Map<string, UserAcc>()
      const userDayShifts = new Map<
        string,
        Map<number, Array<{ revenue: number; durationMinutes: number }>>
      >()
      const seenUserIds = new Set<string>()

      const getOrInitUser = (userId: string) => {
        if (!userSalaryMap.has(userId)) {
          userSalaryMap.set(userId, {
            userName: "Unknown",
            totalSalary: 0,
            snapshotsCount: 0,
            dailySalary: Array.from({ length: daysInMonth }, () => 0),
            dailySnapshotsCount: Array.from({ length: daysInMonth }, () => 0)
          })
        }
        return userSalaryMap.get(userId)!
      }

      const getOrInitUserDayShiftArr = (userId: string, dayIndex: number) => {
        if (!userDayShifts.has(userId)) userDayShifts.set(userId, new Map())
        const dayMap = userDayShifts.get(userId)!
        if (!dayMap.has(dayIndex)) dayMap.set(dayIndex, [])
        return dayMap.get(dayIndex)!
      }

      for (const livestream of livestreams as any[]) {
        const date = new Date(livestream.date)
        const dayIndex = date.getDate() - 1

        for (const snapshot of livestream.snapshots ?? []) {
          if (channelId) {
            const snapshotChannelId = snapshot?.period?.channel?.toString()
            if (snapshotChannelId !== channelId) continue
          }

          const salaryTotal = snapshot?.salary?.total
          if (!salaryTotal) continue

          let targetUserId: string | null = null
          if (snapshot?.altAssignee) {
            if (snapshot.altAssignee === "other") continue
            targetUserId = snapshot.altAssignee.toString()
          } else if (snapshot?.assignee) {
            targetUserId = snapshot.assignee.toString()
          } else {
            continue
          }

          const userAcc = getOrInitUser(targetUserId)
          userAcc.totalSalary += salaryTotal
          userAcc.snapshotsCount += 1
          if (dayIndex >= 0 && dayIndex < daysInMonth) {
            userAcc.dailySalary[dayIndex] += salaryTotal
            userAcc.dailySnapshotsCount[dayIndex] += 1
          }

          if (dayIndex >= 0 && dayIndex < daysInMonth) {
            const revenue = snapshot?.realIncome ?? snapshot?.income ?? 0

            const startMinutes =
              (snapshot?.period?.startTime?.hour ?? 0) * 60 +
              (snapshot?.period?.startTime?.minute ?? 0)
            const endMinutes =
              (snapshot?.period?.endTime?.hour ?? 0) * 60 +
              (snapshot?.period?.endTime?.minute ?? 0)
            const durationMinutes = Math.max(0, endMinutes - startMinutes)

            const arr = getOrInitUserDayShiftArr(targetUserId, dayIndex)
            arr.push({
              revenue: Number(revenue) || 0,
              durationMinutes
            })
          }

          seenUserIds.add(targetUserId)
        }
      }

      if (seenUserIds.size > 0) {
        const users = await this.userModel
          .find(
            { _id: { $in: Array.from(seenUserIds) } },
            { name: 1, username: 1 }
          )
          .lean()
        const nameById = new Map(
          users.map((u: any) => [
            u._id.toString(),
            u.name || u.username || "Unknown"
          ])
        )
        for (const [userId, acc] of userSalaryMap.entries()) {
          acc.userName = nameById.get(userId) ?? "Unknown"
        }
      }

      const usersSorted = Array.from(userSalaryMap.entries())
        .map(([userId, acc]) => ({
          userId,
          userName: acc.userName,
          totalSalary: Math.round(acc.totalSalary),
          snapshotsCount: acc.snapshotsCount,
          dailySalary: acc.dailySalary.map((v) => Math.round(v)),
          dailySnapshotsCount: acc.dailySnapshotsCount
        }))
        .sort((a, b) => b.totalSalary - a.totalSalary)

      const workbook = new ExcelJS.Workbook()

      const sheet = workbook.addWorksheet("Luong")
      sheet.columns = [
        { header: "Tên", key: "name", width: 24 },
        { header: "Ngày", key: "day", width: 14 },
        { header: "Lương", key: "salary", width: 14 },
        { header: "Doanh thu", key: "revenue", width: 14 },
        { header: "Thời gian live", key: "duration", width: 18 }
      ]
      sheet.getColumn(3).numFmt = "#,##0"
      sheet.getColumn(4).numFmt = "#,##0"

      usersSorted.forEach((u) => {
        for (let d = 1; d <= daysInMonth; d++) {
          const dateLabel = `${String(d).padStart(2, "0")}/${String(
            month
          ).padStart(2, "0")}`
          const dayIndex = d - 1
          const shifts = userDayShifts.get(u.userId)?.get(dayIndex) ?? []
          const rowsNeeded = Math.max(1, shifts.length)

          for (let i = 0; i < rowsNeeded; i++) {
            const shift = shifts[i]
            const durationLabel = shift
              ? `${Math.floor(shift.durationMinutes / 60)}h${
                  shift.durationMinutes % 60
                }p`
              : ""
            sheet.addRow({
              name: d === 1 && i === 0 ? u.userName : "",
              day: i === 0 ? dateLabel : "",
              salary: i === 0 ? (u.dailySalary[dayIndex] ?? 0) : "",
              revenue: shift ? shift.revenue : "",
              duration: shift ? durationLabel : ""
            })
          }
        }

        const totalRow = sheet.addRow({
          name: "",
          day: "Tổng",
          salary: u.totalSalary,
          revenue: "",
          duration: ""
        })
        totalRow.eachCell((cell) => {
          cell.font = { ...(cell.font ?? {}), bold: true }
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFF00" }
          }
        })

        sheet.addRow({ name: "", day: "", salary: "" })
      })

      sheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.font = { name: "Times New Roman", size: 11 }
          cell.alignment = { vertical: "middle", horizontal: "left" }
        })
      })

      const buffer = await workbook.xlsx.writeBuffer()
      return Buffer.from(buffer)
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  // Calculate real income from two Excel files
  async calculateRealIncome(
    totalIncomeFile: Express.Multer.File,
    sourceFile: Express.Multer.File,
    date: Date
  ): Promise<{
    success: boolean
    processedOrders: number
    updatedSnapshots: number
    message: string
  }> {
    try {
      // ===== Helpers =====
      const normalizeOrderId = (v: any) =>
        String(v ?? "")
          .trim()
          .replace(/\.0$/, "") // phòng "123...0"
          .replace(/\s+/g, "")

      const normalizeOrderKey = (v: any) =>
        String(v ?? "")
          .replace(/\u00A0/g, " ")
          .trim()
          .replace(/\.0$/, "")
          .replace(/\s+/g, "")
          .replace(/\D/g, "")

      const parseMoney = (v: any): number => {
        if (v == null) return 0
        if (typeof v === "number") return Number.isFinite(v) ? v : 0
        const s = String(v).trim()
        if (!s) return 0
        // bỏ ký tự tiền tệ, khoảng trắng
        const cleaned = s.replace(/[^\d,.\-]/g, "").replace(/\s+/g, "")
        // xử lý 1,234.56 hoặc 1.234,56 hoặc 1234,56
        // heuristic: nếu có cả ',' và '.', lấy dấu cuối làm decimal
        const lastComma = cleaned.lastIndexOf(",")
        const lastDot = cleaned.lastIndexOf(".")
        let normalized = cleaned
        if (lastComma !== -1 && lastDot !== -1) {
          // dấu nào xuất hiện sau là decimal separator
          if (lastComma > lastDot) {
            normalized = cleaned.replace(/\./g, "").replace(",", ".")
          } else {
            normalized = cleaned.replace(/,/g, "")
          }
        } else if (lastComma !== -1 && lastDot === -1) {
          // coi comma là decimal nếu sau nó có 1-2 số, còn lại là thousand
          const decimals = cleaned.length - lastComma - 1
          if (decimals === 1 || decimals === 2) {
            normalized = cleaned.replace(/\./g, "").replace(",", ".")
          } else {
            normalized = cleaned.replace(/,/g, "")
          }
        } else {
          // chỉ dot hoặc none
          normalized = cleaned.replace(/,/g, "")
        }
        const n = Number(normalized)
        return Number.isFinite(n) ? n : 0
      }

      const pickField = (row: any, keys: string[]) => {
        for (const k of keys) {
          if (row && Object.prototype.hasOwnProperty.call(row, k)) return row[k]
        }
        return undefined
      }

      const toMinutes = (h: number, m: number) => h * 60 + m

      const inRange = (orderMin: number, startMin: number, endMin: number) => {
        // normal range: start < end
        if (startMin < endMin) return orderMin >= startMin && orderMin < endMin
        // cross-midnight: ex 23:00-01:00
        return orderMin >= startMin || orderMin < endMin
      }

      const sameYMD = (d: Date, y: number, m: number, day: number) => {
        // source time string là local dd/MM/yyyy, ta so theo UTC-normalized date ở đây
        // Nếu bạn muốn so theo local VN, hãy đổi livestreamDate sang local.
        return (
          d.getUTCFullYear() === y &&
          d.getUTCMonth() + 1 === m &&
          d.getUTCDate() === day
        )
      }

      // ===== Normalize date to 00:00:00 UTC (giữ như code gốc của bạn) =====
      const livestreamDate = new Date(date)
      livestreamDate.setUTCHours(0, 0, 0, 0)
      livestreamDate.setDate(livestreamDate.getDate() + 1)

      // ===== Find livestream for this date first =====
      const livestream = await this.livestreamModel
        .findOne({ date: livestreamDate })
        .exec()

      await this.livestreamModel.updateOne(
        { _id: livestream._id },
        { $set: { "snapshots.$[].realIncome": 0 } }
      )

      if (
        !livestream ||
        !livestream.snapshots ||
        livestream.snapshots.length === 0
      ) {
        throw new HttpException(
          `No livestream found for date ${livestreamDate.toISOString()}`,
          HttpStatus.NOT_FOUND
        )
      }

      // ====== 1) Parse total income file ======
      const totalWorkbook = XLSX.read(totalIncomeFile.buffer, {
        type: "buffer"
      })
      const totalSheetName = totalWorkbook.SheetNames[0]
      const totalSheet = totalWorkbook.Sheets[totalSheetName]

      // raw:false để tránh Order ID bị scientific/mất digit khi Excel lưu dạng số
      const totalReadData = XLSX.utils.sheet_to_json(totalSheet, {
        raw: false,
        defval: ""
      }) as any[]

      if (!totalReadData.length) {
        return {
          success: true,
          processedOrders: 0,
          updatedSnapshots: 0,
          message: "Total income file has no data rows."
        }
      }

      // Nhiều report TikTok có 1 dòng mô tả (Platform unique order ID.) ngay dưới header.
      // sheet_to_json đã dùng dòng header làm key, nên dòng mô tả vẫn là 1 object.
      const isDescriptionRow = (row: any) => {
        const v = String(row["Order ID"] ?? "").toLowerCase()
        return v.includes("platform unique order id")
      }
      const totalData = totalReadData.filter((r) => !isDescriptionRow(r))

      // Build maps:
      // - orderStatusMap: để skip Đã hủy
      // - orderIncomeMap: orderId -> sum(income) theo SKU rows
      const orderStatusMap = new Map<string, string>()
      const orderIncomeMap = new Map<string, number>()

      const totalOrderIdKeys = ["Order ID", "ID đơn hàng"]
      const totalStatusKeys = ["Order Status", "Trạng thái đơn hàng"]
      const subtotalKeys = [
        "SKU Subtotal Before Discount",
        "SKU Subtotal Before Discount (SKU)"
      ]
      const sellerDiscountKeys = [
        "SKU Seller Discount",
        "SKU Seller Discount (SKU)"
      ]

      for (const row of totalData) {
        const orderId = normalizeOrderKey(pickField(row, totalOrderIdKeys))
        if (!orderId) continue

        const status = String(pickField(row, totalStatusKeys) ?? "").trim()
        if (status) orderStatusMap.set(orderId, status)

        const subtotal = parseMoney(pickField(row, subtotalKeys))
        const sellerDiscount = parseMoney(pickField(row, sellerDiscountKeys))
        // const afterDiscountKeys = ["SKU Subtotal After Discount"]
        const income = parseMoney(subtotal - sellerDiscount)

        if (income > 0) {
          orderIncomeMap.set(
            orderId,
            (orderIncomeMap.get(orderId) ?? 0) + income
          )
        }
      }

      // ====== 2) Parse source file ======
      const sourceWorkbook = XLSX.read(sourceFile.buffer, { type: "buffer" })
      const sourceSheetName = sourceWorkbook.SheetNames[0]
      const sourceSheet = sourceWorkbook.Sheets[sourceSheetName]
      const sourceData = XLSX.utils.sheet_to_json(sourceSheet, {
        raw: false,
        defval: ""
      }) as any[]

      let processedOrders = 0
      let updatedSnapshots = 0

      // ====== 3) Process each row in source file ======
      const contentTypeKeys = ["Loại nội dung", "Content Type"]
      const sourceOrderIdKeys = ["ID đơn hàng", "Order ID"]
      const createdTimeKeys = ["Thời gian đã tạo", "Created Time"]

      let liveRows = 0
      let liveRowsInTargetDate = 0
      let hasIncome = 0
      let cancelled = 0
      let hasMatchingSnapshot = 0
      let processed = 0

      const sampleNoIncome: string[] = []
      const sampleHasIncome: string[] = []

      const targetY = livestreamDate.getUTCFullYear()
      const targetM = livestreamDate.getUTCMonth() + 1
      const targetD = livestreamDate.getUTCDate()

      const onlyDigits = (s: string) => s.replace(/\D/g, "")

      const processedOrderIdsInLive = new Set()

      for (const row of sourceData) {
        const contentType = String(pickField(row, contentTypeKeys) ?? "").trim()

        // Only process if content type is "Phát trực tiếp"
        if (contentType !== "Phát trực tiếp") {
          continue
        }

        const orderId = normalizeOrderKey(pickField(row, totalOrderIdKeys))
        if (!orderId) continue

        // Step 1: Skip cancelled orders (status from totalIncome)
        const orderStatus = orderStatusMap.get(orderId) ?? ""
        if (
          orderStatus.includes("Đã hủy") ||
          orderStatus.toLowerCase().includes("cancel")
        ) {
          continue
        }

        // Step 2: Parse time from created time (dd/MM/YYYY hh:mm:ss)
        const createdTime = String(pickField(row, createdTimeKeys) ?? "").trim()
        if (!createdTime) continue

        const match = createdTime.match(
          /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2}):(\d{2})/
        )
        if (!match) continue

        const dd = parseInt(match[1], 10)
        const MM = parseInt(match[2], 10)
        const yyyy = parseInt(match[3], 10)
        const hour = parseInt(match[4], 10)
        const minute = parseInt(match[5], 10)

        // Filter đúng ngày target
        if (!sameYMD(livestreamDate, yyyy, MM, dd)) {
          continue
        }

        if (processedOrderIdsInLive.has(orderId)) continue

        // Step 3: Get income from totalIncome map (đúng theo yêu cầu)
        const incomeAmount = orderIncomeMap.get(orderId) ?? 0
        if (incomeAmount <= 0) continue

        // Step 4: Find matching snapshots based on time
        const orderTimeMinutes = toMinutes(hour, minute)

        const matchingSnapshotIds: string[] = []
        for (const snapshot of livestream.snapshots) {
          const startHour = snapshot.period.startTime.hour
          const startMinute = snapshot.period.startTime.minute
          const endHour = snapshot.period.endTime.hour
          const endMinute = snapshot.period.endTime.minute

          const startMin = toMinutes(startHour, startMinute)
          const endMin = toMinutes(endHour, endMinute)

          if (inRange(orderTimeMinutes, startMin, endMin)) {
            matchingSnapshotIds.push(snapshot._id.toString())
          }
        }

        // Update realIncome for all matching snapshots
        if (matchingSnapshotIds.length > 0) {
          for (const snapshotId of matchingSnapshotIds) {
            const res = await this.livestreamModel.updateOne(
              {
                _id: livestream._id,
                "snapshots._id": new Types.ObjectId(snapshotId)
              },
              { $inc: { "snapshots.$.realIncome": incomeAmount } }
            )

            if (res.modifiedCount > 0) {
              updatedSnapshots++
            }

            if (res.modifiedCount > 0) {
              processedOrderIdsInLive.add(orderId) // Đánh dấu đã cộng tiền đơn này
            }
          }

          processedOrders++
        }
      }

      return {
        success: true,
        processedOrders,
        updatedSnapshots,
        message: `Successfully processed ${processedOrders} orders and updated ${updatedSnapshots} snapshots`
      }
    } catch (error) {
      console.error(error)
      if (error instanceof HttpException) throw error
      throw new HttpException(
        "Error calculating real income from files",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
