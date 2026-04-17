import { Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"
import { ShopeeDailyAds } from "../database/mongoose/schemas/ShopeeDailyAds"
import { ShopeeDailyLiveRevenue } from "../database/mongoose/schemas/ShopeeDailyLiveRevenue"
import { ShopeeIncome } from "../database/mongoose/schemas/ShopeeIncome"
import { ShopeeMonthKpi } from "../database/mongoose/schemas/ShopeeMonthKpi"
import { SHOPEE_TZ } from "./shopee-dashboard.utils"

@Injectable()
export class ShopeeDashboardRepository {
  constructor(
    @InjectModel("livestreamchannels")
    private readonly channelModel: Model<LivestreamChannel>,
    @InjectModel("shopeemonthkpis")
    private readonly monthKpiModel: Model<ShopeeMonthKpi>,
    @InjectModel("shopeedailyads")
    private readonly dailyAdsModel: Model<ShopeeDailyAds>,
    @InjectModel("shopeedailyliverevenues")
    private readonly dailyLiveRevenueModel: Model<ShopeeDailyLiveRevenue>,
    @InjectModel("shopeeincomes")
    private readonly incomeModel: Model<ShopeeIncome>
  ) {}

  async findShopeeLivestreamChannelById(
    id: string
  ): Promise<LivestreamChannel | null> {
    return this.channelModel.findOne({ _id: id, platform: "shopee" }).exec()
  }

  async listShopeeLivestreamChannelIds(): Promise<Types.ObjectId[]> {
    const docs = await this.channelModel
      .find({ platform: "shopee" }, { _id: 1 })
      .lean()
    return docs.map((d) => d._id as Types.ObjectId)
  }

  async aggregateMonthlyTargets(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] },
    month: number,
    year: number
  ) {
    return this.monthKpiModel
      .aggregate([
        { $match: { channel: channelFilter, month, year } },
        {
          $group: {
            _id: null,
            revenueTarget: { $sum: "$revenueKpi" },
            adsCostTarget: { $sum: "$adsCostKpi" },
            roasWeight: { $sum: { $max: [0, "$adsCostKpi"] } },
            roasWeightedValue: {
              $sum: {
                $multiply: ["$roasKpi", { $max: [0, "$adsCostKpi"] }]
              }
            },
            roasAvgValue: { $avg: "$roasKpi" }
          }
        }
      ])
      .exec()
  }

  async aggregateIncomesSummary(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] },
    start: Date,
    end: Date
  ) {
    return this.incomeModel
      .aggregate([
        {
          $match: { channel: channelFilter, orderDate: { $gte: start, $lte: end } }
        },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: { $sum: "$products.buyerPaidTotal" } },
            totalOrders: { $sum: 1 }
          }
        }
      ])
      .exec()
  }

  async aggregateAdsSummary(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] },
    start: Date,
    end: Date
  ) {
    return this.dailyAdsModel
      .aggregate([
        { $match: { channel: channelFilter, date: { $gte: start, $lte: end } } },
        { $group: { _id: null, totalAdsCost: { $sum: "$adsCost" } } }
      ])
      .exec()
  }

  async aggregateLiveRevenueSummary(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] },
    start: Date,
    end: Date
  ) {
    return this.dailyLiveRevenueModel
      .aggregate([
        { $match: { channel: channelFilter, date: { $gte: start, $lte: end } } },
        { $group: { _id: null, totalLiveRevenue: { $sum: "$liveRevenue" } } }
      ])
      .exec()
  }

  async aggregateIncomeTimeseries(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] },
    start: Date,
    end: Date
  ): Promise<Array<{ orderDate: string; revenue: number; orders: number }>> {
    return this.incomeModel
      .aggregate([
        {
          $match: { channel: channelFilter, orderDate: { $gte: start, $lte: end } }
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$orderDate",
                timezone: "UTC"
              }
            },
            revenue: { $sum: { $sum: "$products.buyerPaidTotal" } },
            orders: { $sum: 1 }
          }
        },
        { $project: { _id: 0, orderDate: "$_id", revenue: 1, orders: 1 } },
        { $sort: { orderDate: 1 } }
      ])
      .exec()
  }

  async aggregateAdsTimeseries(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] },
    start: Date,
    end: Date
  ): Promise<Array<{ date: string; adsCost: number }>> {
    return this.dailyAdsModel
      .aggregate([
        { $match: { channel: channelFilter, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$date",
                timezone: SHOPEE_TZ
              }
            },
            adsCost: { $sum: "$adsCost" }
          }
        },
        { $project: { _id: 0, date: "$_id", adsCost: 1 } },
        { $sort: { date: 1 } }
      ])
      .exec()
  }

  async aggregateLiveRevenueTimeseries(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] },
    start: Date,
    end: Date
  ): Promise<Array<{ date: string; liveRevenue: number }>> {
    return this.dailyLiveRevenueModel
      .aggregate([
        { $match: { channel: channelFilter, date: { $gte: start, $lte: end } } },
        {
          $group: {
            _id: {
              $dateToString: {
                format: "%Y-%m-%d",
                date: "$date",
                timezone: SHOPEE_TZ
              }
            },
            liveRevenue: { $sum: "$liveRevenue" }
          }
        },
        { $project: { _id: 0, date: "$_id", liveRevenue: 1 } },
        { $sort: { date: 1 } }
      ])
      .exec()
  }

  async getLastSyncedAt(
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] }
  ): Promise<Date | null> {
    const [income, ads, live] = await Promise.all([
      this.incomeModel
        .findOne({ channel: channelFilter }, { orderDate: 1 })
        .sort({ orderDate: -1 })
        .lean<{ orderDate: Date }>(),
      this.dailyAdsModel
        .findOne({ channel: channelFilter }, { date: 1 })
        .sort({ date: -1 })
        .lean(),
      this.dailyLiveRevenueModel
        .findOne({ channel: channelFilter }, { date: 1 })
        .sort({ date: -1 })
        .lean()
    ])

    const dates = [income?.orderDate, ads?.date, live?.date].filter(Boolean) as Date[]
    if (dates.length === 0) return null
    return new Date(Math.max(...dates.map((d) => d.getTime())))
  }

  async queryOrders(params: {
    channelFilter: Types.ObjectId | { $in: Types.ObjectId[] }
    start: Date
    end: Date
    page: number
    pageSize: number
    sortBy: "orderDate" | "revenue" | "orderCode" | "productCount"
    sortOrder: 1 | -1
  }): Promise<{
    totalItems: number
    items: Array<{
      orderDate: string
      orderCode: string
      customerName: string | null
      shop: string | null
      productName: string
      revenue: number
      productCount: number
    }>
  }> {
    const sortFieldMap = {
      orderDate: "orderDate",
      revenue: "revenue",
      orderCode: "orderCode",
      productCount: "productCount"
    } as const

    const sortField = sortFieldMap[params.sortBy]
    const pipeline: any[] = [
      {
        $match: {
          channel: params.channelFilter,
          orderDate: { $gte: params.start, $lte: params.end }
        }
      },
      {
        $lookup: {
          from: "livestreamchannels",
          localField: "channel",
          foreignField: "_id",
          as: "channelDoc"
        }
      },
      {
        $lookup: {
          from: "shopeeproducts",
          localField: "products.variantSku",
          foreignField: "_id",
          as: "productDocs"
        }
      },
      {
        $unwind: {
          path: "$channelDoc",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $addFields: {
          orderDateText: {
            $dateToString: {
              format: "%Y-%m-%d",
              date: "$orderDate",
              timezone: "UTC"
            }
          },
          productCount: { $size: { $ifNull: ["$products", []] } },
          revenue: { $sum: "$products.buyerPaidTotal" },
          productName: {
            $reduce: {
              input: "$productDocs.name",
              initialValue: "",
              in: {
                $concat: [
                  "$$value",
                  { $cond: [{ $eq: ["$$value", ""] }, "", ", "] },
                  "$$this"
                ]
              }
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          orderDate: "$orderDateText",
          orderCode: "$orderId",
          customerName: null,
          shop: "$channelDoc.name",
          productName: 1,
          revenue: 1,
          productCount: 1
        }
      },
      {
        $sort: {
          [sortField]: params.sortOrder,
          orderCode: 1
        }
      },
      {
        $facet: {
          items: [
            { $skip: (params.page - 1) * params.pageSize },
            { $limit: params.pageSize }
          ],
          total: [{ $count: "count" }]
        }
      }
    ]

    const result = await this.incomeModel.aggregate(pipeline).exec()
    const totalItems = Number(result[0]?.total?.[0]?.count || 0)
    const items = (result[0]?.items || []) as Array<{
      orderDate: string
      orderCode: string
      customerName: string | null
      shop: string | null
      productName: string
      revenue: number
      productCount: number
    }>

    return { totalItems, items }
  }
}
