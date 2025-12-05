import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { SalesDailyReport } from "../database/mongoose/schemas/SalesDailyReport"
import { SalesMonthKpi } from "../database/mongoose/schemas/SalesMonthKpi"
import { SalesDashboardService } from "../salesdashboard/salesdashboard.service"
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import { SalesOrder } from "../database/mongoose/schemas/SalesOrder"
import { SalesFunnel } from "../database/mongoose/schemas/SalesFunnel"

@Injectable()
export class SalesDailyReportsService {
  constructor(
    @InjectModel("salesdailyreports")
    private readonly salesDailyReportModel: Model<SalesDailyReport>,
    @InjectModel("salesmonthkpis")
    private readonly salesMonthKpiModel: Model<SalesMonthKpi>,
    @InjectModel("dailyads")
    private readonly dailyAdsModel: Model<DailyAds>,
    @InjectModel("salesorders")
    private readonly salesOrderModel: Model<SalesOrder>,
    @InjectModel("salesfunnel")
    private readonly salesFunnelModel: Model<SalesFunnel>,
    private readonly salesDashboardService: SalesDashboardService
  ) {}

  /**
   * 1. Get revenue data for a specific channel and date
   */
  async getRevenueForDate(
    date: Date,
    channelId: string
  ): Promise<{
    revenue: number
    newFunnelRevenue: {
      ads: number
      other: number
    }
    returningFunnelRevenue: number
    newOrder: number
    returningOrder: number
    accumulatedRevenue: number
    accumulatedAdsCost: number
    accumulatedNewFunnelRevenue: {
      ads: number
      other: number
    }
  }> {
    try {
      const targetDate = new Date(date)

      // Get revenue stats for the specific date using salesdashboard service
      const stats = await this.salesDashboardService.getRevenueStats(
        targetDate,
        targetDate
      )

      // Filter revenue by channel
      const channelRevenue = stats.revenueByChannel.find(
        (ch) => ch.channelId === channelId
      )

      const revenue = channelRevenue?.revenue || 0

      // Calculate new/returning funnel revenue for this specific channel
      // We need to query orders directly for this channel
      const startOfDay = new Date(targetDate)
      startOfDay.setUTCHours(0, 0, 0, 0)
      const endOfDay = new Date(targetDate)
      endOfDay.setUTCHours(23, 59, 59, 999)

      // Get funnels for this channel
      const funnels = await this.salesFunnelModel
        .find({ channel: new Types.ObjectId(channelId) })
        .select("_id funnelSource")
        .lean()

      const funnelIdList = funnels.map((f) => f._id)

      // Create a map of funnel ID to funnel source for quick lookup
      const funnelSourceMap = new Map(
        funnels.map((f) => [f._id.toString(), f.funnelSource])
      )

      // Get orders for this channel's funnels
      const channelOrders = await this.salesOrderModel
        .find({
          date: { $gte: startOfDay, $lte: endOfDay },
          status: "official",
          salesFunnelId: { $in: funnelIdList }
        })
        .lean()

      let newFunnelRevenueAds = 0
      let newFunnelRevenueOther = 0
      let returningFunnelRevenue = 0
      let newOrder = 0
      let returningOrder = 0

      channelOrders.forEach((order) => {
        const totalDiscount =
          (order.orderDiscount || 0) + (order.otherDiscount || 0)
        const tax = order.tax || 0
        const shippingCost = order.shippingCost || 0
        const actualRevenue = order.total - totalDiscount + tax + shippingCost

        if (order.returning) {
          returningFunnelRevenue += actualRevenue
          returningOrder++
        } else {
          newOrder++
          // Check funnel source
          const funnelSource = funnelSourceMap.get(
            order.salesFunnelId.toString()
          )
          if (funnelSource === "ads") {
            newFunnelRevenueAds += actualRevenue
          } else {
            newFunnelRevenueOther += actualRevenue
          }
        }
      })

      // Calculate accumulated values for the month
      const year = targetDate.getFullYear()
      const month = targetDate.getMonth()
      // minus 7 hours
      const startOfMonth = new Date(year, month, 1, 0, 0, 0, 0)
      startOfMonth.setUTCHours(startOfMonth.getUTCHours() - 7)
      const endOfPreviousDay = new Date(targetDate)
      endOfPreviousDay.setUTCHours(23, 59, 59, 999)
      endOfPreviousDay.setUTCHours(endOfPreviousDay.getUTCHours() - 7)

      // Get all reports from start of month to previous day
      const previousReports = await this.salesDailyReportModel
        .find({
          channel: new Types.ObjectId(channelId),
          date: { $gte: startOfMonth, $lte: endOfPreviousDay },
          deletedAt: null
        })
        .lean()

      const accumulatedRevenue = previousReports.reduce(
        (sum, report) => sum + (report.revenue || 0),
        0
      )

      const accumulatedNewFunnelRevenueAds = previousReports.reduce(
        (sum, report) => {
          const adsRevenue =
            typeof report.newFunnelRevenue === "number"
              ? 0 // Old format, no way to split
              : report.newFunnelRevenue?.ads || 0
          return sum + adsRevenue
        },
        0
      )

      const accumulatedNewFunnelRevenueOther = previousReports.reduce(
        (sum, report) => {
          const otherRevenue =
            typeof report.newFunnelRevenue === "number"
              ? report.newFunnelRevenue // Old format goes to "other"
              : report.newFunnelRevenue?.other || 0
          return sum + otherRevenue
        },
        0
      )

      const accumulatedAdsCost = previousReports.reduce(
        (sum, report) => sum + (report.adsCost || 0),
        0
      )

      return {
        revenue: Math.round(revenue),
        newFunnelRevenue: {
          ads: Math.round(newFunnelRevenueAds),
          other: Math.round(newFunnelRevenueOther)
        },
        returningFunnelRevenue: Math.round(returningFunnelRevenue),
        newOrder,
        returningOrder,
        accumulatedRevenue: Math.round(accumulatedRevenue),
        accumulatedAdsCost: Math.round(accumulatedAdsCost),
        accumulatedNewFunnelRevenue: {
          ads: Math.round(accumulatedNewFunnelRevenueAds),
          other: Math.round(accumulatedNewFunnelRevenueOther)
        }
      }
    } catch (error) {
      console.error("Error in getRevenueForDate:", error)
      throw new HttpException(
        "Lỗi khi lấy dữ liệu doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 2. Create a new daily report
   */
  async createReport(payload: {
    date: Date
    channel: string
    adsCost: number
    dateKpi: number
    revenue: number
    newFunnelRevenue: {
      ads: number
      other: number
    }
    returningFunnelRevenue: number
    newOrder: number
    returningOrder: number
    accumulatedRevenue: number
    accumulatedAdsCost: number
    accumulatedNewFunnelRevenue: {
      ads: number
      other: number
    }
  }): Promise<SalesDailyReport> {
    try {
      const report = new this.salesDailyReportModel({
        date: payload.date,
        channel: new Types.ObjectId(payload.channel),
        adsCost: payload.adsCost,
        dateKpi: payload.dateKpi,
        revenue: payload.revenue,
        newFunnelRevenue: payload.newFunnelRevenue,
        returningFunnelRevenue: payload.returningFunnelRevenue,
        newOrder: payload.newOrder,
        returningOrder: payload.returningOrder,
        accumulatedRevenue: payload.accumulatedRevenue,
        accumulatedAdsCost: payload.accumulatedAdsCost,
        accumulatedNewFunnelRevenue: payload.accumulatedNewFunnelRevenue,
        createdAt: new Date(),
        updatedAt: new Date()
      })

      return await report.save()
    } catch (error) {
      console.error("Error in createReport:", error)
      throw new HttpException(
        "Lỗi khi tạo báo cáo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 3. Hard delete a report
   */
  async deleteReport(reportId: string): Promise<void> {
    try {
      const report = await this.salesDailyReportModel.findById(reportId)
      if (!report) {
        throw new HttpException("Báo cáo không tồn tại", HttpStatus.NOT_FOUND)
      }

      await this.salesDailyReportModel.findByIdAndDelete(reportId)
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in deleteReport:", error)
      throw new HttpException(
        "Lỗi khi xóa báo cáo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 4. Get reports by month
   */
  async getReportsByMonth(
    month: number,
    year: number,
    channelId?: string,
    includeDeleted = false
  ): Promise<{ data: SalesDailyReport[]; total: number }> {
    try {
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0)
      startOfMonth.setUTCHours(startOfMonth.getUTCHours() - 7)
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)
      endOfMonth.setUTCHours(endOfMonth.getUTCHours() - 7)

      const filter: any = {
        date: { $gte: startOfMonth, $lte: endOfMonth }
      }

      if (channelId) {
        filter.channel = new Types.ObjectId(channelId)
      }

      if (!includeDeleted) {
        filter.deletedAt = null
      }

      const [reports, total] = await Promise.all([
        this.salesDailyReportModel
          .find(filter)
          .populate("channel", "channelName phoneNumber")
          .sort({ date: 1 })
          .lean(),
        this.salesDailyReportModel.countDocuments(filter)
      ])

      return {
        data: reports as SalesDailyReport[],
        total
      }
    } catch (error) {
      console.error("Error in getReportsByMonth:", error)
      throw new HttpException(
        "Lỗi khi lấy báo cáo theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 5. Get report detail by ID
   */
  async getReportDetail(reportId: string): Promise<SalesDailyReport | null> {
    try {
      const report = await this.salesDailyReportModel
        .findById(reportId)
        .populate("channel", "channelName phoneNumber")
        .lean()

      if (!report) {
        throw new HttpException("Báo cáo không tồn tại", HttpStatus.NOT_FOUND)
      }

      return report as SalesDailyReport
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getReportDetail:", error)
      throw new HttpException(
        "Lỗi khi lấy chi tiết báo cáo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 6. Get month KPI for a specific date
   */
  async getMonthKpi(
    date: Date,
    channelId: string
  ): Promise<SalesMonthKpi | null> {
    try {
      const targetDate = new Date(date)
      const month = targetDate.getMonth() + 1 // 1-based month
      const year = targetDate.getFullYear()

      const kpi = await this.salesMonthKpiModel
        .findOne({
          month,
          year,
          channel: new Types.ObjectId(channelId)
        })
        .populate("channel", "channelName phoneNumber")
        .lean()

      return kpi as SalesMonthKpi
    } catch (error) {
      console.error("Error in getMonthKpi:", error)
      throw new HttpException(
        "Lỗi khi lấy KPI tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 7. Get accumulated revenue for a month
   */
  async getAccumulatedRevenueForMonth(
    month: number,
    year: number,
    channelId: string
  ): Promise<number> {
    try {
      const startOfMonth = new Date(year, month - 1, 1, 0, 0, 0, 0)
      const endOfMonth = new Date(year, month, 0, 23, 59, 59, 999)

      const reports = await this.salesDailyReportModel
        .find({
          channel: new Types.ObjectId(channelId),
          date: { $gte: startOfMonth, $lte: endOfMonth },
          deletedAt: null
        })
        .lean()

      const accumulatedRevenue = reports.reduce(
        (sum, report) => sum + (report.revenue || 0),
        0
      )

      return accumulatedRevenue
    } catch (error) {
      console.error("Error in getAccumulatedRevenueForMonth:", error)
      throw new HttpException(
        "Lỗi khi lấy doanh thu lũy kế tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 8. Create or update month KPI
   */
  async createOrUpdateMonthKpi(payload: {
    month: number
    year: number
    channel: string
    kpi: number
  }): Promise<SalesMonthKpi> {
    try {
      const existing = await this.salesMonthKpiModel.findOne({
        month: payload.month,
        year: payload.year,
        channel: new Types.ObjectId(payload.channel)
      })

      if (existing) {
        existing.kpi = payload.kpi
        return await existing.save()
      }

      const newKpi = new this.salesMonthKpiModel({
        month: payload.month,
        year: payload.year,
        channel: new Types.ObjectId(payload.channel),
        kpi: payload.kpi
      })

      return await newKpi.save()
    } catch (error) {
      console.error("Error in createOrUpdateMonthKpi:", error)
      throw new HttpException(
        "Lỗi khi tạo/cập nhật KPI tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 9. Get month KPIs with pagination
   */
  async getMonthKpis(
    page: number = 1,
    limit: number = 10,
    month?: number,
    year?: number,
    channelId?: string
  ): Promise<{
    data: SalesMonthKpi[]
    total: number
  }> {
    try {
      const filter: any = {}

      if (month) filter.month = month
      if (year) filter.year = year
      if (channelId) filter.channel = new Types.ObjectId(channelId)

      const skip = (page - 1) * limit

      const [kpis, total] = await Promise.all([
        this.salesMonthKpiModel
          .find(filter)
          .populate("channel", "channelName phoneNumber")
          .sort({ year: -1, month: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        this.salesMonthKpiModel.countDocuments(filter)
      ])

      return {
        data: kpis as SalesMonthKpi[],
        total
      }
    } catch (error) {
      console.error("Error in getMonthKpis:", error)
      throw new HttpException(
        "Lỗi khi lấy danh sách KPI tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * 10. Get month KPI detail by ID
   */
  async getMonthKpiDetail(kpiId: string): Promise<SalesMonthKpi | null> {
    try {
      const kpi = await this.salesMonthKpiModel
        .findById(kpiId)
        .populate("channel", "channelName phoneNumber")
        .lean()

      if (!kpi) {
        throw new HttpException("KPI không tồn tại", HttpStatus.NOT_FOUND)
      }

      return kpi as SalesMonthKpi
    } catch (error) {
      if (error instanceof HttpException) throw error
      console.error("Error in getMonthKpiDetail:", error)
      throw new HttpException(
        "Lỗi khi lấy chi tiết KPI",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
