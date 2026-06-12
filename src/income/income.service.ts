import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model, Types } from "mongoose"
import { Income } from "../database/mongoose/schemas/Income"
import {
  InsertIncomeFileDto,
  UpdateAffiliateTypeDto,
  XlsxAffiliateData,
  XlsxIncomeData
} from "./dto/income.dto"
import * as XLSX from "xlsx"
import * as ExcelJS from "exceljs"
import { PackingRulesService } from "../packingrules/packingrules.service"
import { MonthGoal } from "../database/mongoose/schemas/MonthGoal"
import { Response } from "express"
import { DailyAds } from "../database/mongoose/schemas/DailyAds"
import { DailyAdsMetrics } from "../database/mongoose/schemas/DailyAdsMetrics"
import { format as formatDateFns } from "date-fns"
import { OWN_USERS } from "../constants/own-users"
import { LivestreamChannel } from "../database/mongoose/schemas/LivestreamChannel"

@Injectable()
export class IncomeService {
  constructor(
    @InjectModel("incomes")
    private readonly incomeModel: Model<Income>,
    @InjectModel("monthgoals")
    private readonly monthGoalModel: Model<MonthGoal>,
    private readonly packingRulesService: PackingRulesService,
    @InjectModel("dailyads")
    private readonly dailyAdsModel: Model<DailyAds>,
    @InjectModel("dailyadsmetrics")
    private readonly dailyAdsMetricsModel: Model<DailyAdsMetrics>,
    @InjectModel("livestreamchannels")
    private readonly livestreamChannelModel: Model<LivestreamChannel>
  ) {}

  private isDateOnlyInput(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
  }

  private createVietnamDayBoundary(value: string, endOfDay: boolean): Date {
    const [year, month, day] = value.split("-").map(Number)
    const startOfDayUtcMs =
      Date.UTC(year, month - 1, day, 0, 0, 0, 0) - 7 * 60 * 60 * 1000

    return new Date(
      endOfDay ? startOfDayUtcMs + 24 * 60 * 60 * 1000 - 1 : startOfDayUtcMs
    )
  }

  private resolveRangeStatsDates(
    startDate: Date | string,
    endDate: Date | string
  ): { start: Date; end: Date } {
    const rawStart = typeof startDate === "string" ? startDate.trim() : null
    const rawEnd = typeof endDate === "string" ? endDate.trim() : null

    if (
      rawStart &&
      rawEnd &&
      this.isDateOnlyInput(rawStart) &&
      this.isDateOnlyInput(rawEnd)
    ) {
      return {
        start: this.createVietnamDayBoundary(rawStart, false),
        end: this.createVietnamDayBoundary(rawEnd, true)
      }
    }

    const start = new Date(startDate)
    const end = new Date(endDate)

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new HttpException(
        "startDate hoặc endDate không hợp lệ",
        HttpStatus.BAD_REQUEST
      )
    }

    return { start, end }
  }

  private buildIncomeStatusPayload(line?: Partial<XlsxIncomeData>) {
    return {
      orderStatus: String(line?.["Order Status"] || "").trim() || undefined,
      orderSubstatus:
        String(line?.["Order Substatus"] || "").trim() || undefined,
      cancelationOrReturnType:
        String(line?.["Cancelation/Return Type"] || "").trim() || undefined,
      orderRefundAmount: Number(line?.["Order Refund Amount"] || 0) || 0
    }
  }

  private async aggregateIncomeAmounts(
    start: Date,
    end: Date,
    channelId?: string
  ): Promise<{ incomeBeforeDiscount: number; incomeAfterDiscount: number }> {
    const filter: any = { date: { $gte: start, $lte: end } }
    if (channelId) {
      filter.channel = new Types.ObjectId(channelId)
    }

    const incomes = await this.incomeModel.find(filter).lean()

    let incomeBeforeDiscount = 0
    let incomeAfterDiscount = 0

    for (const income of incomes) {
      for (const product of income.products || []) {
        const priceBeforeDiscount = Number(product.price || 0)
        const sellerDiscount = Number(product.sellerDiscount || 0)
        incomeBeforeDiscount += priceBeforeDiscount
        incomeAfterDiscount += priceBeforeDiscount - sellerDiscount
      }
    }

    return { incomeBeforeDiscount, incomeAfterDiscount }
  }

  private async aggregateDailyAdsMetrics(
    start: Date,
    end: Date,
    channelId?: string,
    incomeAmounts?: { incomeBeforeDiscount: number; incomeAfterDiscount: number }
  ): Promise<{
    roiProtect: number
    fullRefundGmv: number
    tinRefundAmount: number
    adsTax: number
    gmvAds: number
    affiliateCost: number
    affiliateRefundAmount: number
    incomeBeforeDiscount: number
    incomeAfterDiscount: number
    actualAdsCost: number
    totalCost: number
    costAfterRefund: number
    adsRatioOnBeforeDiscountRevenue: number
    totalCostRatioOnBeforeDiscountRevenue: number
    costAfterRefundRatioOnBeforeDiscountRevenue: number
    affiliateRatioOnBeforeDiscountRevenue: number
    recordsCount: number
  }> {
    const filter: any = { date: { $gte: start, $lte: end } }
    if (channelId) {
      filter.channel = new Types.ObjectId(channelId)
    }

    const rows = await this.dailyAdsMetricsModel
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            roiProtect: { $sum: { $ifNull: ["$roiProtect", 0] } },
            fullRefundGmv: { $sum: { $ifNull: ["$fullRefundGmv", 0] } },
            tinRefundAmount: { $sum: { $ifNull: ["$tinRefundAmount", 0] } },
            adsTax: { $sum: { $ifNull: ["$adsTax", 0] } },
            gmvAds: { $sum: { $ifNull: ["$gmvAds", 0] } },
            affiliateCost: { $sum: { $ifNull: ["$affiliateCost", 0] } },
            affiliateRefundAmount: {
              $sum: { $ifNull: ["$affiliateRefundAmount", 0] }
            },
            actualAdsCost: { $sum: { $ifNull: ["$actualAdsCost", 0] } },
            totalCost: { $sum: { $ifNull: ["$totalCost", 0] } },
            costAfterRefund: { $sum: { $ifNull: ["$costAfterRefund", 0] } },
            recordsCount: { $sum: 1 }
          }
        }
      ])
      .exec()

    const data = rows?.[0] || {}
    const incomeAgg =
      incomeAmounts || (await this.aggregateIncomeAmounts(start, end, channelId))
    const incomeBeforeDiscount = Number(incomeAgg.incomeBeforeDiscount || 0)
    return {
      roiProtect: Number(data.roiProtect || 0),
      fullRefundGmv: Number(data.fullRefundGmv || 0),
      tinRefundAmount: Number(data.tinRefundAmount || 0),
      adsTax: Number(data.adsTax || 0),
      gmvAds: Number(data.gmvAds || 0),
      affiliateCost: Number(data.affiliateCost || 0),
      affiliateRefundAmount: Number(data.affiliateRefundAmount || 0),
      incomeBeforeDiscount,
      incomeAfterDiscount: Number(incomeAgg.incomeAfterDiscount || 0),
      actualAdsCost: Number(data.actualAdsCost || 0),
      totalCost: Number(data.totalCost || 0),
      costAfterRefund: Number(data.costAfterRefund || 0),
      adsRatioOnBeforeDiscountRevenue:
        incomeBeforeDiscount > 0
          ? Math.round(
              (Number(data.actualAdsCost || 0) / incomeBeforeDiscount) * 10000
            ) / 100
          : 0,
      totalCostRatioOnBeforeDiscountRevenue:
        incomeBeforeDiscount > 0
          ? Math.round(
              (Number(data.totalCost || 0) / incomeBeforeDiscount) * 10000
            ) / 100
          : 0,
      costAfterRefundRatioOnBeforeDiscountRevenue:
        incomeBeforeDiscount > 0
          ? Math.round(
              (Number(data.costAfterRefund || 0) / incomeBeforeDiscount) * 10000
            ) / 100
          : 0,
      affiliateRatioOnBeforeDiscountRevenue:
        incomeBeforeDiscount > 0
          ? Math.round(
              (Number(data.affiliateCost || 0) / incomeBeforeDiscount) * 10000
            ) / 100
          : 0,
      recordsCount: Number(data.recordsCount || 0)
    }
  }

  private async aggregateRangeIncomeStats(
    start: Date,
    end: Date,
    channelId: string
  ) {
    const rows = await this.incomeModel
      .aggregate([
        {
          $match: {
            date: { $gte: start, $lte: end },
            channel: new Types.ObjectId(channelId)
          }
        },
        {
          $facet: {
            productStats: [
              { $unwind: "$products" },
              {
                $project: {
                  price: { $ifNull: ["$products.price", 0] },
                  platformDiscount: {
                    $ifNull: ["$products.platformDiscount", 0]
                  },
                  sellerDiscount: {
                    $ifNull: ["$products.sellerDiscount", 0]
                  },
                  source: { $ifNull: ["$products.source", "other"] },
                  content: { $ifNull: ["$products.content", ""] },
                  creator: { $ifNull: ["$products.creator", ""] },
                  quantity: { $ifNull: ["$products.quantity", 0] },
                  box: "$products.box",
                  code: { $ifNull: ["$products.code", "(unknown)"] }
                }
              },
              {
                $project: {
                  price: 1,
                  platformDiscount: 1,
                  sellerDiscount: 1,
                  source: 1,
                  quantity: 1,
                  box: 1,
                  code: 1,
                  afterSellerDiscount: { $subtract: ["$price", "$sellerDiscount"] },
                  isLive: {
                    $regexMatch: {
                      input: "$content",
                      regex: "Phát trực tiếp|livestream",
                      options: "i"
                    }
                  },
                  isVideo: {
                    $regexMatch: {
                      input: "$content",
                      regex: "video",
                      options: "i"
                    }
                  },
                  isOwnCreator: { $in: ["$creator", OWN_USERS] }
                }
              },
              {
                $group: {
                  _id: null,
                  totalIncomeBeforeDiscount: { $sum: "$price" },
                  totalIncomeAfterDiscount: { $sum: "$afterSellerDiscount" },
                  totalPlatformDiscount: { $sum: "$platformDiscount" },
                  totalSellerDiscount: { $sum: "$sellerDiscount" },
                  totalOriginalPrice: { $sum: "$price" },
                  orderCount: { $sum: 1 },
                  liveIncomeBeforeDiscount: {
                    $sum: { $cond: ["$isLive", "$price", 0] }
                  },
                  liveIncomeAfterDiscount: {
                    $sum: { $cond: ["$isLive", "$afterSellerDiscount", 0] }
                  },
                  ownVideoIncomeBeforeDiscount: {
                    $sum: {
                      $cond: [
                        { $and: ["$isVideo", "$isOwnCreator"] },
                        "$price",
                        0
                      ]
                    }
                  },
                  ownVideoIncomeAfterDiscount: {
                    $sum: {
                      $cond: [
                        { $and: ["$isVideo", "$isOwnCreator"] },
                        "$afterSellerDiscount",
                        0
                      ]
                    }
                  },
                  otherVideoIncomeBeforeDiscount: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            "$isVideo",
                            { $not: ["$isOwnCreator"] }
                          ]
                        },
                        "$price",
                        0
                      ]
                    }
                  },
                  otherVideoIncomeAfterDiscount: {
                    $sum: {
                      $cond: [
                        {
                          $and: [
                            "$isVideo",
                            { $not: ["$isOwnCreator"] }
                          ]
                        },
                        "$afterSellerDiscount",
                        0
                      ]
                    }
                  },
                  sourcesBeforeDiscountAds: {
                    $sum: { $cond: [{ $eq: ["$source", "ads"] }, "$price", 0] }
                  },
                  sourcesBeforeDiscountAffiliate: {
                    $sum: {
                      $cond: [{ $eq: ["$source", "affiliate"] }, "$price", 0]
                    }
                  },
                  sourcesBeforeDiscountAffiliateAds: {
                    $sum: {
                      $cond: [
                        { $eq: ["$source", "affiliate-ads"] },
                        "$price",
                        0
                      ]
                    }
                  },
                  sourcesBeforeDiscountOther: {
                    $sum: {
                      $cond: [
                        {
                          $not: [
                            {
                              $in: [
                                "$source",
                                ["ads", "affiliate", "affiliate-ads"]
                              ]
                            }
                          ]
                        },
                        "$price",
                        0
                      ]
                    }
                  },
                  sourcesAfterDiscountAds: {
                    $sum: {
                      $cond: [
                        { $eq: ["$source", "ads"] },
                        "$afterSellerDiscount",
                        0
                      ]
                    }
                  },
                  sourcesAfterDiscountAffiliate: {
                    $sum: {
                      $cond: [
                        { $eq: ["$source", "affiliate"] },
                        "$afterSellerDiscount",
                        0
                      ]
                    }
                  },
                  sourcesAfterDiscountAffiliateAds: {
                    $sum: {
                      $cond: [
                        { $eq: ["$source", "affiliate-ads"] },
                        "$afterSellerDiscount",
                        0
                      ]
                    }
                  },
                  sourcesAfterDiscountOther: {
                    $sum: {
                      $cond: [
                        {
                          $not: [
                            {
                              $in: [
                                "$source",
                                ["ads", "affiliate", "affiliate-ads"]
                              ]
                            }
                          ]
                        },
                        "$afterSellerDiscount",
                        0
                      ]
                    }
                  }
                }
              }
            ],
            boxes: [
              { $unwind: "$products" },
              {
                $match: {
                  "products.box": { $exists: true, $nin: [null, ""] }
                }
              },
              {
                $group: {
                  _id: "$products.box",
                  quantity: { $sum: { $ifNull: ["$products.quantity", 0] } }
                }
              },
              { $sort: { _id: 1 } }
            ],
            productsQuantity: [
              { $unwind: "$products" },
              {
                $group: {
                  _id: {
                    $cond: [
                      { $in: ["$products.code", [null, ""]] },
                      "(unknown)",
                      "$products.code"
                    ]
                  },
                  quantity: { $sum: { $ifNull: ["$products.quantity", 0] } }
                }
              },
              { $sort: { quantity: -1 } }
            ],
            shippingProviders: [
              {
                $group: {
                  _id: {
                    $cond: [
                      { $in: ["$shippingProvider", [null, ""]] },
                      "(unknown)",
                      "$shippingProvider"
                    ]
                  },
                  orders: { $sum: 1 }
                }
              },
              { $sort: { orders: -1 } }
            ],
            orders: [
              {
                $project: {
                  products: { $ifNull: ["$products", []] }
                }
              },
              {
                $project: {
                  isLive: {
                    $anyElementTrue: {
                      $map: {
                        input: "$products",
                        as: "product",
                        in: {
                          $regexMatch: {
                            input: { $ifNull: ["$$product.content", ""] },
                            regex: "Phát trực tiếp|livestream",
                            options: "i"
                          }
                        }
                      }
                    }
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: 1 },
                  live: { $sum: { $cond: ["$isLive", 1, 0] } },
                  shop: { $sum: { $cond: ["$isLive", 0, 1] } }
                }
              }
            ]
          }
        }
      ])
      .exec()

    const row = rows?.[0] || {}
    const stats = row.productStats?.[0] || {}
    const orderStats = row.orders?.[0] || {}
    const videoIncomeBeforeDiscount =
      Number(stats.ownVideoIncomeBeforeDiscount || 0) +
      Number(stats.otherVideoIncomeBeforeDiscount || 0)
    const videoIncomeAfterDiscount =
      Number(stats.ownVideoIncomeAfterDiscount || 0) +
      Number(stats.otherVideoIncomeAfterDiscount || 0)
    const totalIncomeBeforeDiscount = Number(
      stats.totalIncomeBeforeDiscount || 0
    )
    const totalIncomeAfterDiscount = Number(stats.totalIncomeAfterDiscount || 0)
    const liveIncomeBeforeDiscount = Number(
      stats.liveIncomeBeforeDiscount || 0
    )
    const liveIncomeAfterDiscount = Number(stats.liveIncomeAfterDiscount || 0)
    const totalOriginalPrice = Number(stats.totalOriginalPrice || 0)
    const totalSellerDiscount = Number(stats.totalSellerDiscount || 0)

    return {
      beforeDiscount: {
        totalIncome: totalIncomeBeforeDiscount,
        liveIncome: liveIncomeBeforeDiscount,
        videoIncome: videoIncomeBeforeDiscount,
        ownVideoIncome: Number(stats.ownVideoIncomeBeforeDiscount || 0),
        otherVideoIncome: Number(stats.otherVideoIncomeBeforeDiscount || 0),
        otherIncome:
          totalIncomeBeforeDiscount -
          videoIncomeBeforeDiscount -
          liveIncomeBeforeDiscount,
        sources: {
          ads: Number(stats.sourcesBeforeDiscountAds || 0),
          affiliate: Number(stats.sourcesBeforeDiscountAffiliate || 0),
          affiliateAds: Number(stats.sourcesBeforeDiscountAffiliateAds || 0),
          other: Number(stats.sourcesBeforeDiscountOther || 0)
        }
      },
      afterDiscount: {
        totalIncome: totalIncomeAfterDiscount,
        liveIncome: liveIncomeAfterDiscount,
        videoIncome: videoIncomeAfterDiscount,
        ownVideoIncome: Number(stats.ownVideoIncomeAfterDiscount || 0),
        otherVideoIncome: Number(stats.otherVideoIncomeAfterDiscount || 0),
        otherIncome:
          totalIncomeAfterDiscount -
          videoIncomeAfterDiscount -
          liveIncomeAfterDiscount,
        sources: {
          ads: Number(stats.sourcesAfterDiscountAds || 0),
          affiliate: Number(stats.sourcesAfterDiscountAffiliate || 0),
          affiliateAds: Number(stats.sourcesAfterDiscountAffiliateAds || 0),
          other: Number(stats.sourcesAfterDiscountOther || 0)
        }
      },
      boxes: (row.boxes || []).map((item) => ({
        box: item._id,
        quantity: Number(item.quantity || 0)
      })),
      shippingProviders: (row.shippingProviders || []).map((item) => ({
        provider: item._id || "(unknown)",
        orders: Number(item.orders || 0)
      })),
      discounts: {
        totalPlatformDiscount: Number(stats.totalPlatformDiscount || 0),
        totalSellerDiscount,
        totalDiscount:
          Number(stats.totalPlatformDiscount || 0) + totalSellerDiscount,
        avgDiscountPerOrder:
          Number(stats.orderCount || 0) > 0
            ? totalSellerDiscount / Number(stats.orderCount || 0)
            : 0,
        discountPercentage:
          totalOriginalPrice > 0
            ? Math.round((totalSellerDiscount / totalOriginalPrice) * 10000) /
              100
            : 0
      },
      orders: {
        total: Number(orderStats.total || 0),
        live: Number(orderStats.live || 0),
        shop: Number(orderStats.shop || 0)
      },
      productsQuantity: Object.fromEntries(
        (row.productsQuantity || []).map((item) => [
          item._id || "(unknown)",
          Number(item.quantity || 0)
        ])
      )
    }
  }

  private getMonthlySplitRange(month: number, year: number): {
    start: Date
    end: Date
  } {
    const start = new Date(Date.UTC(year, month, 1))
    start.setUTCHours(start.getUTCHours() - 7)

    const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
    end.setUTCHours(end.getUTCHours() - 7)

    return { start, end }
  }

  private async aggregateMonthSplitStats(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{
    income: {
      beforeDiscount: { live: number; shop: number }
      afterDiscount: { live: number; shop: number }
    }
    quantity: { live: number; shop: number }
    orders: { live: number; shop: number }
  }> {
    const { start, end } = this.getMonthlySplitRange(month, year)
    const match: any = { date: { $gte: start, $lte: end } }
    if (channelId) match.channel = new Types.ObjectId(channelId)

    const rows = await this.incomeModel
      .aggregate([
        { $match: match },
        {
          $facet: {
            products: [
              { $unwind: "$products" },
              {
                $project: {
                  price: { $ifNull: ["$products.price", 0] },
                  sellerDiscount: {
                    $ifNull: ["$products.sellerDiscount", 0]
                  },
                  quantity: { $ifNull: ["$products.quantity", 0] },
                  isLive: {
                    $regexMatch: {
                      input: { $ifNull: ["$products.content", ""] },
                      regex: "Phát trực tiếp|livestream",
                      options: "i"
                    }
                  }
                }
              },
              {
                $project: {
                  price: 1,
                  quantity: 1,
                  isLive: 1,
                  afterSellerDiscount: {
                    $subtract: ["$price", "$sellerDiscount"]
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  liveBeforeDiscount: {
                    $sum: { $cond: ["$isLive", "$price", 0] }
                  },
                  shopBeforeDiscount: {
                    $sum: { $cond: ["$isLive", 0, "$price"] }
                  },
                  liveAfterDiscount: {
                    $sum: { $cond: ["$isLive", "$afterSellerDiscount", 0] }
                  },
                  shopAfterDiscount: {
                    $sum: { $cond: ["$isLive", 0, "$afterSellerDiscount"] }
                  },
                  liveQuantity: {
                    $sum: { $cond: ["$isLive", "$quantity", 0] }
                  },
                  shopQuantity: {
                    $sum: { $cond: ["$isLive", 0, "$quantity"] }
                  }
                }
              }
            ],
            orders: [
              {
                $project: {
                  products: { $ifNull: ["$products", []] }
                }
              },
              {
                $project: {
                  hasLive: {
                    $anyElementTrue: {
                      $map: {
                        input: "$products",
                        as: "product",
                        in: {
                          $regexMatch: {
                            input: { $ifNull: ["$$product.content", ""] },
                            regex: "Phát trực tiếp|livestream",
                            options: "i"
                          }
                        }
                      }
                    }
                  },
                  hasShop: {
                    $anyElementTrue: {
                      $map: {
                        input: "$products",
                        as: "product",
                        in: {
                          $not: [
                            {
                              $regexMatch: {
                                input: { $ifNull: ["$$product.content", ""] },
                                regex: "Phát trực tiếp|livestream",
                                options: "i"
                              }
                            }
                          ]
                        }
                      }
                    }
                  }
                }
              },
              {
                $group: {
                  _id: null,
                  live: { $sum: { $cond: ["$hasLive", 1, 0] } },
                  shop: { $sum: { $cond: ["$hasShop", 1, 0] } }
                }
              }
            ]
          }
        }
      ])
      .exec()

    const row = rows?.[0] || {}
    const productStats = row.products?.[0] || {}
    const orderStats = row.orders?.[0] || {}

    return {
      income: {
        beforeDiscount: {
          live: Number(productStats.liveBeforeDiscount || 0),
          shop: Number(productStats.shopBeforeDiscount || 0)
        },
        afterDiscount: {
          live: Number(productStats.liveAfterDiscount || 0),
          shop: Number(productStats.shopAfterDiscount || 0)
        }
      },
      quantity: {
        live: Number(productStats.liveQuantity || 0),
        shop: Number(productStats.shopQuantity || 0)
      },
      orders: {
        live: Number(orderStats.live || 0),
        shop: Number(orderStats.shop || 0)
      }
    }
  }

  /** @deprecated */
  async insertIncome(dto: InsertIncomeFileDto): Promise<void> {
    try {
      const workbook = XLSX.read(dto.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const readData = XLSX.utils.sheet_to_json(sheet) as XlsxIncomeData[]
      const data = readData
        .slice(1)
        .filter((line) => line["Cancelation/Return Type"] !== "Cancel")

      const start = new Date(dto.date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(dto.date)
      end.setHours(23, 59, 59, 999)

      // 1. Lấy toàn bộ incomes trong ngày
      const incomes = await this.incomeModel.find({
        date: { $gte: start, $lte: end }
      })

      // 2. Với từng income, filter lại products
      // Build bulk ops để tránh await nhiều lần
      const bulkOps: any[] = []
      for (const income of incomes) {
        const filtered = (income.products || []).filter(
          (p) => p.source !== dto.type
        )
        if (filtered.length === 0) {
          bulkOps.push({ deleteOne: { filter: { _id: income._id } } })
        } else if (filtered.length < (income.products || []).length) {
          bulkOps.push({
            updateOne: {
              filter: { _id: income._id },
              update: { $set: { products: filtered } }
            }
          })
        }
      }
      if (bulkOps.length > 0) {
        await this.incomeModel.bulkWrite(bulkOps, { ordered: false })
      }

      // 3. Build lại data mới từ file, giữ nguyên các logic đặc biệt của mày
      const existed = await this.incomeModel
        .find(
          {
            date: { $gte: start, $lte: end }
          },
          { orderId: 1 }
        )
        .lean()
      const existedOrderIds = new Set(existed.map((x) => x.orderId))

      // group
      const newIncomesMap = data.reduce(
        (acc, line) => {
          const orderId = line["Order ID"]
          if (!acc[orderId]) acc[orderId] = []
          acc[orderId].push(line)
          return acc
        },
        {} as Record<string, XlsxIncomeData[]>
      )

      const inserts: any[] = []
      const updateOps: any[] = []
      for (const orderId in newIncomesMap) {
        const lines = newIncomesMap[orderId]
        const shippingProvider = this.getShippingProviderName(lines[0] as any)
        if (existedOrderIds.has(orderId)) {
          // Đã tồn tại: update thêm products mới cho đúng logic
          // Build new products theo rule
          let newProducts: any[] = []
          if (dto.type === "affiliate") {
            newProducts = lines.map((line) => ({
              code: line["Seller SKU"],
              name: line["Product Name"],
              source: "affiliate",
              quantity: line["Quantity"],
              quotation: line["SKU Unit Original Price"],
              price: line["SKU Subtotal Before Discount"],
              platformDiscount: line["SKU Platform Discount"],
              sellerDiscount: line["SKU Seller Discount"],
              priceAfterDiscount: line["SKU Subtotal After Discount"],
              sourceChecked: false
            }))
          } else {
            if (lines.length > 1) {
              newProducts = lines.slice(1).map((line) => ({
                code: line["Seller SKU"],
                name: line["Product Name"],
                source: dto.type,
                quantity: line["Quantity"],
                quotation: line["SKU Unit Original Price"],
                price: line["SKU Subtotal Before Discount"],
                platformDiscount: line["SKU Platform Discount"],
                sellerDiscount: line["SKU Seller Discount"],
                priceAfterDiscount: line["SKU Subtotal After Discount"],
                sourceChecked: false
              }))
            }
          }
          const upd: any = {}
          if (newProducts.length > 0)
            upd.$push = { products: { $each: newProducts } }
          if (shippingProvider) upd.$set = { shippingProvider }
          if (Object.keys(upd).length > 0) {
            updateOps.push({
              updateOne: {
                filter: { orderId, date: { $gte: start, $lte: end } },
                update: upd
              }
            })
          }
        } else {
          // orderId mới: add mới bình thường
          const products = lines.map((line) => ({
            code: line["Seller SKU"],
            name: line["Product Name"],
            source: dto.type,
            quantity: line["Quantity"],
            quotation: line["SKU Unit Original Price"],
            price: line["SKU Subtotal Before Discount"],
            platformDiscount: line["SKU Platform Discount"] || 0,
            sellerDiscount: line["SKU Seller Discount"] || 0,
            priceAfterDiscount: line["SKU Subtotal After Discount"] || 0,
            sourceChecked: false
          }))
          inserts.push({
            orderId,
            customer: lines[0]["Buyer Username"],
            province: lines[0]["Province"],
            shippingProvider,
            channel: dto.channel,
            date: dto.date,
            products
          })
        }
      }
      if (updateOps.length)
        await this.incomeModel.bulkWrite(updateOps, { ordered: false })
      if (inserts.length)
        await this.incomeModel.insertMany(inserts, { ordered: false })

      // Sau khi insert/update xong thì cập nhật quy cách đóng hộp ngay
      await this.updateIncomesBox(new Date(dto.date))
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính toán doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async deleteIncomeByDate(date: Date): Promise<void> {
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      const result = await this.incomeModel.deleteMany({
        date: {
          $gte: start,
          $lte: end
        }
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xoá income theo ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateAffiliateType(dto: UpdateAffiliateTypeDto): Promise<void> {
    try {
      const workbook = XLSX.read(dto.file.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const data = XLSX.utils.sheet_to_json(sheet) as XlsxAffiliateData[]

      data.forEach(async (line) => {
        const existedOrder = await this.incomeModel
          .findOne({
            orderId: line["ID đơn hàng"]
          })
          .exec()
        if (existedOrder) {
          const foundProduct = existedOrder.products.find((p) => {
            return (
              p.code === line["Sku người bán"] &&
              p.quantity === Number(line["Số lượng"]) &&
              p.sourceChecked === false
            )
          })

          if (foundProduct) {
            foundProduct.sourceChecked = true
            foundProduct.creator = line["Tên người dùng nhà sáng tạo"]
            foundProduct.source = OWN_USERS.includes(
              line["Tên người dùng nhà sáng tạo"]
            )
              ? "ads"
              : line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"] &&
                  !line["Tỷ lệ hoa hồng tiêu chuẩn"]
                ? "affiliate-ads"
                : line["Tỷ lệ hoa hồng tiêu chuẩn"] &&
                    !line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
                  ? "affiliate"
                  : "other"
            foundProduct.content = line["Loại nội dung"]

            const affiliateAdsPercentage = Number(
              line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
            )
            foundProduct.affiliateAdsPercentage = isNaN(affiliateAdsPercentage)
              ? 0
              : affiliateAdsPercentage

            const affiliateAdsAmount = Number(
              line["Thanh toán hoa hồng Quảng cáo cửa hàng ước tính"]
            )
            foundProduct.affiliateAdsAmount = isNaN(affiliateAdsAmount)
              ? 0
              : affiliateAdsAmount

            const standardAffPercentage = Number(
              line["Tỷ lệ hoa hồng tiêu chuẩn"]
            )
            foundProduct.standardAffPercentage = isNaN(standardAffPercentage)
              ? 0
              : standardAffPercentage

            const standardAffAmount = Number(
              line["Thanh toán hoa hồng tiêu chuẩn ước tính"]
            )
            foundProduct.standardAffAmount = isNaN(standardAffAmount)
              ? 0
              : standardAffAmount

            await existedOrder.save()
          }
        }
      })
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật loại affiliate",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getIncomesByDateRange(
    startDate: Date,
    endDate: Date,
    page = 1,
    limit = 10,
    orderId?: string,
    productCode?: string,
    productSource?: string,
    channelId?: string
  ): Promise<{ incomes: Income[]; total: number }> {
    try {
      const safePage = Math.max(1, Number(page) || 1)
      const safeLimit = Math.max(1, Number(limit) || 10)

      const start = new Date(startDate)
      start.setUTCHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setUTCHours(23, 59, 59, 999)

      // Build filter
      const filter: any = {
        date: { $gte: start, $lte: end }
      }
      if (orderId) filter.orderId = String(orderId).trim()
      // Lọc theo các trường trong mảng products
      if (productCode) filter["products.code"] = productCode
      if (productSource) filter["products.source"] = productSource
      if (channelId) filter.channel = channelId

      const total = await this.incomeModel.countDocuments(filter)

      const incomes = await this.incomeModel
        .find(filter)
        .populate("channel", "_id name")
        .sort({ date: 1, _id: 1 })
        .skip((safePage - 1) * safeLimit)
        .limit(safeLimit)
        .exec()

      return { incomes, total }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy doanh thu theo ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateIncomesBox(date: Date): Promise<void> {
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      const incomes = await this.incomeModel
        .find({
          date: {
            $gte: start,
            $lte: end
          }
        })
        .exec()

      for (const income of incomes) {
        const productsArr = income.products || []

        // Build products array for getPackingType
        const productsForPacking = productsArr.map((p) => ({
          productCode: p.code,
          quantity: p.quantity
        }))

        // Get packing type for this combination of products
        const boxType =
          await this.packingRulesService.getPackingType(productsForPacking)

        // If a matching rule is found, update all products in the order
        if (boxType) {
          let needSave = false

          for (const product of productsArr) {
            if (product.box !== boxType) {
              product.box = boxType
              needSave = true
            }
          }

          if (needSave) {
            await income.save()
          }
        }
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật box cho doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async totalIncomeByMonthSplit(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{
    beforeDiscount: { live: number; shop: number }
    afterDiscount: { live: number; shop: number }
  }> {
    try {
      const splitStats = await this.aggregateMonthSplitStats(
        month,
        year,
        channelId
      )
      return splitStats.income
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính doanh thu theo kênh",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async totalQuantityByMonthSplit(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{ live: number; shop: number }> {
    try {
      const splitStats = await this.aggregateMonthSplitStats(
        month,
        year,
        channelId
      )
      return splitStats.quantity
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính số lượng theo kênh",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async totalOrdersByMonthSplit(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{ live: number; shop: number }> {
    try {
      const splitStats = await this.aggregateMonthSplitStats(
        month,
        year,
        channelId
      )
      return splitStats.orders
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính số đơn hàng theo kênh",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async KPIPercentageByMonthSplit(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{ live: number; shop: number }> {
    try {
      const filter: any = { month, year }
      if (channelId) filter.channel = channelId

      const goal = await this.monthGoalModel.findOne(filter).lean()
      if (!goal) {
        throw new HttpException(
          "Chưa thiết lập mục tiêu tháng/channel này",
          HttpStatus.NOT_FOUND
        )
      }

      const splitStats = await this.aggregateMonthSplitStats(
        month,
        year,
        channelId
      )
      const live = splitStats.income.afterDiscount.live
      const shop = splitStats.income.afterDiscount.shop
      const livePct =
        goal.liveStreamGoal === 0
          ? 0
          : Math.min(
              Math.round((live / goal.liveStreamGoal) * 10000) / 100,
              999
            )
      const shopPct =
        goal.shopGoal === 0
          ? 0
          : Math.min(Math.round((shop / goal.shopGoal) * 10000) / 100, 999)
      return { live: livePct, shop: shopPct }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính KPI theo kênh",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async exportIncomesToXlsx(
    startDate: Date,
    endDate: Date,
    orderId?: string,
    productCode?: string,
    productSource?: string
  ): Promise<Buffer> {
    try {
      const start = new Date(startDate)
      start.setUTCHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setUTCHours(23, 59, 59, 999)

      const packingTypesMap = {
        small: "Hộp bé",
        big: "Hộp to",
        long: "Hộp dài",
        "big-35": "Hộp to 35",
        square: "Hộp vuông"
      } as const

      const sourcesMap = {
        ads: "ADS",
        affiliate: "AFFILIATE",
        "affiliate-ads": "AFFILIATE ADS",
        other: "KHÁC"
      } as const

      const filter: Record<string, any> = {
        date: { $gte: start, $lte: end }
      }
      if (orderId) filter.orderId = String(orderId).trim()
      if (productCode) filter["products.code"] = productCode
      if (productSource) filter["products.source"] = productSource

      const incomes = await this.incomeModel
        .find(filter)
        .populate("channel", "_id name")
        .sort({ date: 1, _id: 1 })
        .lean()

      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet("DoanhThu")

      worksheet.columns = [
        { header: "Ngày xuất đơn", key: "date", width: 15 },
        { header: "Mã đơn hàng", key: "orderId", width: 20 },
        { header: "Khách hàng", key: "customer", width: 25 },
        { header: "Tỉnh thành", key: "province", width: 20 },
        { header: "Kênh", key: "channel", width: 20 },
        { header: "Đơn vị vận chuyển", key: "shippingProvider", width: 20 },
        { header: "Mã SP", key: "code", width: 15 },
        { header: "Tên SP", key: "name", width: 30 },
        { header: "Nguồn", key: "source", width: 15 },
        { header: "Số lượng", key: "quantity", width: 12 },
        { header: "Báo giá", key: "quotation", width: 15 },
        { header: "Giá bán", key: "price", width: 15 },
        { header: "Giảm giá từ platform", key: "platformDiscount", width: 20 },
        { header: "Giảm giá từ người bán", key: "sellerDiscount", width: 20 },
        {
          header: "Giá sau giảm voucher",
          key: "priceAfterDiscount",
          width: 20
        },
        {
          header: "Phần trăm Affiliate",
          key: "affiliateAdsPercentage",
          width: 20
        },
        {
          header: "Phần trăm Affiliate tiêu chuẩn",
          key: "standardAffPercentage",
          width: 25
        },
        { header: "Loại nội dung", key: "content", width: 20 },
        { header: "Quy cách đóng hộp", key: "box", width: 20 },
        { header: "Nhà sáng tạo", key: "creator", width: 20 },
        {
          header: "Thanh toán hoa hồng Quảng cáo cửa hàng ước tính",
          key: "affiliateAdsAmount",
          width: 35
        },
        {
          header: "Thanh toán hoa hồng tiêu chuẩn ước tính",
          key: "standardAffAmount",
          width: 35
        }
      ]

      const mergeCells: Array<{
        startRow: number
        endRow: number
        colIndex: number
      }> = []

      let currentRow = 2

      incomes.forEach((income) => {
        const startRow = currentRow
        const channelName = (income.channel as any)?.name || ""

        income.products.forEach((product, idx) => {
          worksheet.addRow([
            idx === 0 ? this.formatDate(income.date as Date) : "",
            idx === 0 ? income.orderId : "",
            idx === 0 ? income.customer : "",
            idx === 0 ? income.province : "",
            idx === 0 ? channelName : "",
            idx === 0 ? income.shippingProvider || "" : "",
            product.code,
            product.name,
            sourcesMap[product.source],
            product.quantity,
            this.formatMoney(product.quotation),
            this.formatMoney(product.price),
            this.formatMoney(product.platformDiscount),
            this.formatMoney(product.sellerDiscount),
            this.formatMoney(product.priceAfterDiscount),
            product.affiliateAdsPercentage ?? "",
            product.standardAffPercentage ?? "",
            product.content ?? "",
            packingTypesMap[product.box ?? ""],
            product.creator ?? "",
            this.formatMoney(product.affiliateAdsAmount),
            this.formatMoney(product.standardAffAmount)
          ])
          currentRow++
        })

        if (income.products.length > 1) {
          for (let colIdx = 0; colIdx < 6; colIdx++) {
            mergeCells.push({
              startRow,
              endRow: currentRow - 1,
              colIndex: colIdx + 1
            })
          }
        }
      })

      mergeCells.forEach((merge) => {
        worksheet.mergeCells(
          merge.startRow,
          merge.colIndex,
          merge.endRow,
          merge.colIndex
        )
      })

      worksheet.eachRow((row) => {
        row.eachCell((cell) => {
          cell.font = { name: "Times New Roman", size: 11 }
          cell.alignment = { vertical: "middle", horizontal: "left" }
        })
      })

      const buffer = await workbook.xlsx.writeBuffer()
      return Buffer.from(buffer)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xuất file doanh thu",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getTopCreators(
    startDate: Date,
    endDate: Date
  ): Promise<{
    affiliate: {
      beforeDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
      afterDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
    }
    affiliateAds: {
      beforeDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
      afterDiscount: {
        creator: string
        totalIncome: number
        percentage: number
      }[]
    }
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const rows: Array<{
        _id: { source: string; creator: string }
        totalIncomeBeforeDiscount: number
        totalIncomeAfterDiscount: number
      }> = await this.incomeModel.aggregate([
        { $match: { date: { $gte: start, $lte: end } } },
        { $unwind: "$products" },
        {
          $match: { "products.source": { $in: ["affiliate", "affiliate-ads"] } }
        },
        {
          $group: {
            _id: {
              source: "$products.source",
              creator: { $ifNull: ["$products.creator", "(unknown)"] }
            },
            totalIncomeBeforeDiscount: {
              $sum: { $ifNull: ["$products.price", 0] }
            },
            totalIncomeAfterDiscount: {
              $sum: {
                $ifNull: [
                  {
                    $ifNull: ["$products.priceAfterDiscount", "$products.price"]
                  },
                  0
                ]
              }
            }
          }
        }
      ])

      const bySourceBeforeDiscount: Record<
        string,
        { creator: string; totalIncome: number }[]
      > = {
        affiliate: [],
        "affiliate-ads": []
      }

      const bySourceAfterDiscount: Record<
        string,
        { creator: string; totalIncome: number }[]
      > = {
        affiliate: [],
        "affiliate-ads": []
      }

      for (const r of rows) {
        bySourceBeforeDiscount[r._id.source].push({
          creator: r._id.creator,
          totalIncome: r.totalIncomeBeforeDiscount
        })
        bySourceAfterDiscount[r._id.source].push({
          creator: r._id.creator,
          totalIncome: r.totalIncomeAfterDiscount
        })
      }

      // Tính tổng của từng source (toàn bộ creators của source đó)
      const sourceTotalsBeforeDiscount: Record<string, number> = {
        affiliate: bySourceBeforeDiscount["affiliate"].reduce(
          (s, v) => s + v.totalIncome,
          0
        ),
        "affiliate-ads": bySourceBeforeDiscount["affiliate-ads"].reduce(
          (s, v) => s + v.totalIncome,
          0
        )
      }

      const sourceTotalsAfterDiscount: Record<string, number> = {
        affiliate: bySourceAfterDiscount["affiliate"].reduce(
          (s, v) => s + v.totalIncome,
          0
        ),
        "affiliate-ads": bySourceAfterDiscount["affiliate-ads"].reduce(
          (s, v) => s + v.totalIncome,
          0
        )
      }

      function buildTop(
        arr: { creator: string; totalIncome: number }[],
        totalSource: number
      ): { creator: string; totalIncome: number; percentage: number }[] {
        return arr
          .sort((a, b) => b.totalIncome - a.totalIncome)
          .slice(0, 10)
          .map((x) => ({
            creator: x.creator,
            totalIncome: x.totalIncome,
            // phần trăm trên tổng của chính source đó
            percentage:
              totalSource === 0
                ? 0
                : Math.round((x.totalIncome / totalSource) * 100 * 100) / 100
          }))
      }

      return {
        affiliate: {
          beforeDiscount: buildTop(
            bySourceBeforeDiscount["affiliate"],
            sourceTotalsBeforeDiscount["affiliate"]
          ),
          afterDiscount: buildTop(
            bySourceAfterDiscount["affiliate"],
            sourceTotalsAfterDiscount["affiliate"]
          )
        },
        affiliateAds: {
          beforeDiscount: buildTop(
            bySourceBeforeDiscount["affiliate-ads"],
            sourceTotalsBeforeDiscount["affiliate-ads"]
          ),
          afterDiscount: buildTop(
            bySourceAfterDiscount["affiliate-ads"],
            sourceTotalsAfterDiscount["affiliate-ads"]
          )
        }
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính top nhà sáng tạo",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async resetSourceChecked(date: Date): Promise<{ updated: number }> {
    try {
      const start = new Date(date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(date)
      end.setHours(23, 59, 59, 999)

      const incomes = await this.incomeModel.find({
        date: { $gte: start, $lte: end }
      })

      let updated = 0
      for (const income of incomes) {
        let needSave = false
        for (const p of income.products) {
          if (p.sourceChecked) {
            p.sourceChecked = false
            needSave = true
            updated++
          }
        }
        if (needSave) await income.save()
      }
      return { updated }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi reset sourceChecked",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async totalLiveAndShopIncomeByMonth(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{
    beforeDiscount: { live: number; shop: number }
    afterDiscount: { live: number; shop: number }
  }> {
    try {
      const splitStats = await this.aggregateMonthSplitStats(
        month,
        year,
        channelId
      )
      return splitStats.income
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính doanh thu live/shop theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async adsCostSplitByMonth(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{
    liveAdsCost: number
    shopAdsCost: number
    actualAdsCost: number
    totalCost: number
    costAfterRefund: number
    percentages: {
      liveAdsToLiveIncome: number
      shopAdsToShopIncome: number
    }
    ratios: {
      adsRatioOnBeforeDiscountRevenue: number
      totalCostRatioOnBeforeDiscountRevenue: number
      costAfterRefundRatioOnBeforeDiscountRevenue: number
      affiliateRatioOnBeforeDiscountRevenue: number
    }
    rawMetrics: {
      roiProtect: number
      fullRefundGmv: number
      tinRefundAmount: number
      adsTax: number
      gmvAds: number
      affiliateCost: number
      affiliateRefundAmount: number
      incomeBeforeDiscount: number
      incomeAfterDiscount: number
      recordsCount: number
    }
    totalIncome: { live: number; shop: number }
    kpi: {
      liveKpi: number
      shopKpi: number
      liveKpiPercentage: number
      shopKpiPercentage: number
    }
  }> {
    try {
      // Adjust for GMT+7 timezone (Vietnam time)
      const start = new Date(Date.UTC(year, month, 1))
      start.setDate(start.getDate() - 1)

      const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      end.setDate(end.getDate() - 1)

      // Sum daily ads cost in month
      const adsFilter: any = { date: { $gte: start, $lte: end } }
      if (channelId) {
        adsFilter.channel = new Types.ObjectId(channelId)
      }

      const adsAggPromise = this.dailyAdsModel
        .aggregate([
          { $match: adsFilter },
          {
            $group: {
              _id: null,
              liveAdsCost: { $sum: { $ifNull: ["$liveAdsCost", 0] } },
              shopAdsCost: { $sum: { $ifNull: ["$shopAdsCost", 0] } }
            }
          }
        ])
        .exec()
      const splitStatsPromise = this.aggregateMonthSplitStats(
        month,
        year,
        channelId
      )
      const goalFilter: any = { month, year }
      if (channelId) goalFilter.channel = channelId

      const monthGoalPromise = this.monthGoalModel.findOne(goalFilter).lean()
      const [rows, splitStats, monthGoal] = await Promise.all([
        adsAggPromise,
        splitStatsPromise,
        monthGoalPromise
      ])
      const liveAdsCost = rows?.[0]?.liveAdsCost || 0
      const shopAdsCost = rows?.[0]?.shopAdsCost || 0
      const totalAdsCost = Number(liveAdsCost || 0) + Number(shopAdsCost || 0)
      const metricsAgg = await this.aggregateDailyAdsMetrics(
        start,
        end,
        channelId,
        {
          incomeBeforeDiscount:
            splitStats.income.beforeDiscount.live +
            splitStats.income.beforeDiscount.shop,
          incomeAfterDiscount:
            splitStats.income.afterDiscount.live +
            splitStats.income.afterDiscount.shop
        }
      )

      const live = splitStats.income.afterDiscount.live
      const shop = splitStats.income.afterDiscount.shop

      const percentages = {
        liveAdsToLiveIncome:
          live === 0 ? 0 : Math.round((liveAdsCost / live) * 10000) / 100,
        shopAdsToShopIncome:
          shop === 0 ? 0 : Math.round((shopAdsCost / shop) * 10000) / 100
      }

      const liveKpi = monthGoal?.liveStreamGoal || 0
      const shopKpi = monthGoal?.shopGoal || 0
      const liveKpiPercentage =
        liveKpi === 0
          ? 0
          : Math.min(Math.round((live / liveKpi) * 10000) / 100, 999)
      const shopKpiPercentage =
        shopKpi === 0
          ? 0
          : Math.min(Math.round((shop / shopKpi) * 10000) / 100, 999)

      return {
        liveAdsCost,
        shopAdsCost,
        actualAdsCost: metricsAgg.actualAdsCost,
        totalCost: metricsAgg.totalCost,
        costAfterRefund: metricsAgg.costAfterRefund,
        percentages,
        ratios: {
          adsRatioOnBeforeDiscountRevenue:
            metricsAgg.incomeBeforeDiscount > 0
              ? Math.round(
                  (totalAdsCost / metricsAgg.incomeBeforeDiscount) * 10000
                ) / 100
              : 0,
          totalCostRatioOnBeforeDiscountRevenue:
            metricsAgg.totalCostRatioOnBeforeDiscountRevenue,
          costAfterRefundRatioOnBeforeDiscountRevenue:
            metricsAgg.costAfterRefundRatioOnBeforeDiscountRevenue,
          affiliateRatioOnBeforeDiscountRevenue:
            metricsAgg.affiliateRatioOnBeforeDiscountRevenue
        },
        rawMetrics: {
          roiProtect: metricsAgg.roiProtect,
          fullRefundGmv: metricsAgg.fullRefundGmv,
          tinRefundAmount: metricsAgg.tinRefundAmount,
          adsTax: metricsAgg.adsTax,
          gmvAds: metricsAgg.gmvAds,
          affiliateCost: metricsAgg.affiliateCost,
          affiliateRefundAmount: metricsAgg.affiliateRefundAmount,
          incomeBeforeDiscount: metricsAgg.incomeBeforeDiscount,
          incomeAfterDiscount: metricsAgg.incomeAfterDiscount,
          recordsCount: metricsAgg.recordsCount
        },
        totalIncome: { live, shop },
        kpi: {
          liveKpi,
          shopKpi,
          liveKpiPercentage,
          shopKpiPercentage
        }
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính chi phí quảng cáo theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getRangeStats(
    startDate: Date | string,
    endDate: Date | string,
    channelId: string,
    comparePrevious = true
  ): Promise<{
    period: { startDate: Date; endDate: Date; days: number }
    current: {
      beforeDiscount: {
        totalIncome: number
        liveIncome: number
        videoIncome: number
        ownVideoIncome: number
        otherVideoIncome: number
        otherIncome: number
        sources: {
          ads: number
          affiliate: number
          affiliateAds: number
          other: number
        }
      }
      afterDiscount: {
        totalIncome: number
        liveIncome: number
        videoIncome: number
        ownVideoIncome: number
        otherVideoIncome: number
        otherIncome: number
        sources: {
          ads: number
          affiliate: number
          affiliateAds: number
          other: number
        }
      }
      boxes: { box: string; quantity: number }[]
      shippingProviders: { provider: string; orders: number }[]
      ads: {
        totalAdsCost: number
        liveAdsCost: number
        shopAdsCost: number
        percentages: {
          liveAdsToLiveIncome: number
          shopAdsToShopIncome: number
        }
        metrics: {
          roiProtect: number
          fullRefundGmv: number
          tinRefundAmount: number
          adsTax: number
          gmvAds: number
          affiliateCost: number
          affiliateRefundAmount: number
          incomeBeforeDiscount: number
          incomeAfterDiscount: number
          actualAdsCost: number
          totalCost: number
          costAfterRefund: number
          ratios: {
            adsRatioOnBeforeDiscountRevenue: number
            totalCostRatioOnBeforeDiscountRevenue: number
            costAfterRefundRatioOnBeforeDiscountRevenue: number
            affiliateRatioOnBeforeDiscountRevenue: number
          }
          recordsCount: number
        }
      }
      discounts: {
        totalPlatformDiscount: number
        totalSellerDiscount: number
        totalDiscount: number
        avgDiscountPerOrder: number
        discountPercentage: number
      }
      orders: {
        total: number
        live: number
        shop: number
      }
      productsQuantity: {
        [code: string]: number
      }
      dailyGoal?: {
        beforeDiscount: {
          liveIncomePercentage: number
          shopIncomePercentage: number
          incomePercentage: number
        }
        afterDiscount: {
          liveIncomePercentage: number
          shopIncomePercentage: number
          incomePercentage: number
        }
        goals: {
          dailyLiveIncomeGoal: number
          dailyShopIncomeGoal: number
          dailyTotalIncomeGoal: number
        }
      }
    }
    changes?: {
      beforeDiscount: {
        totalIncomePct: number
        liveIncomePct: number
        videoIncomePct: number
        ownVideoIncomePct: number
        otherVideoIncomePct: number
        sources: {
          adsPct: number
          affiliatePct: number
          affiliateAdsPct: number
          otherPct: number
        }
      }
      afterDiscount: {
        totalIncomePct: number
        liveIncomePct: number
        videoIncomePct: number
        ownVideoIncomePct: number
        otherVideoIncomePct: number
        sources: {
          adsPct: number
          affiliatePct: number
          affiliateAdsPct: number
          otherPct: number
        }
      }
      ads: {
        totalAdsCostPct: number
        liveAdsCostPct: number
        shopAdsCostPct: number
        liveAdsToLiveIncomePctDiff: number
        shopAdsToShopIncomePctDiff: number
        actualAdsCostPct: number
        totalCostPct: number
        costAfterRefundPct: number
        adsRatioOnBeforeDiscountRevenueDiff: number
        totalCostRatioOnBeforeDiscountRevenueDiff: number
        costAfterRefundRatioOnBeforeDiscountRevenueDiff: number
      }
      discounts: {
        totalPlatformDiscountPct: number
        totalSellerDiscountPct: number
        totalDiscountPct: number
        avgDiscountPerOrderPct: number
        discountPercentageDiff: number
      }
      orders: {
        totalPct: number
        livePct: number
        shopPct: number
      }
    }
  }> {
    try {
      if (!channelId) {
        throw new HttpException("channelId là bắt buộc", HttpStatus.BAD_REQUEST)
      }

      const { start, end } = this.resolveRangeStatsDates(startDate, endDate)
      if (end < start)
        throw new HttpException(
          "Khoảng ngày không hợp lệ",
          HttpStatus.BAD_REQUEST
        )
      const rangeDurationMs = end.getTime() - start.getTime() + 1
      const days = Math.max(1, Math.ceil(rangeDurationMs / 86400000))

      const buildStats = async (s: Date, e: Date) => {
        const incomeStatsPromise = this.aggregateRangeIncomeStats(
          s,
          e,
          channelId
        )
        const adsFilter: any = { date: { $gte: s, $lte: e } }
        if (channelId) {
          adsFilter.channel = new Types.ObjectId(channelId)
        }

        const adsAggPromise = this.dailyAdsModel
          .aggregate([
            { $match: adsFilter },
            {
              $group: {
                _id: null,
                liveAdsCost: { $sum: { $ifNull: ["$liveAdsCost", 0] } },
                shopAdsCost: { $sum: { $ifNull: ["$shopAdsCost", 0] } }
              }
            }
          ])
          .exec()
        const [incomeStats, adsAgg] = await Promise.all([
          incomeStatsPromise,
          adsAggPromise
        ])
        const liveAdsCost = adsAgg?.[0]?.liveAdsCost || 0
        const shopAdsCost = adsAgg?.[0]?.shopAdsCost || 0
        const totalAdsCost = Number(liveAdsCost || 0) + Number(shopAdsCost || 0)
        const metricsAgg = await this.aggregateDailyAdsMetrics(
          s,
          e,
          channelId,
          {
            incomeBeforeDiscount:
              incomeStats.beforeDiscount.totalIncome,
            incomeAfterDiscount: incomeStats.afterDiscount.totalIncome
          }
        )
        const shopIncomeAfterDiscount =
          incomeStats.afterDiscount.videoIncome +
          incomeStats.afterDiscount.otherIncome
        const adsRatioOnBeforeDiscountRevenue =
          incomeStats.beforeDiscount.totalIncome > 0
            ? Math.round(
                (totalAdsCost / incomeStats.beforeDiscount.totalIncome) * 10000
              ) / 100
            : 0
        const percentages = {
          liveAdsToLiveIncome:
            incomeStats.afterDiscount.liveIncome === 0
              ? 0
              : Math.round(
                  (liveAdsCost / incomeStats.afterDiscount.liveIncome) * 10000
                ) / 100,
          shopAdsToShopIncome:
            shopIncomeAfterDiscount === 0
              ? 0
              : Math.round(
                  (shopAdsCost / shopIncomeAfterDiscount) * 10000
                ) / 100
        }

        return {
          beforeDiscount: incomeStats.beforeDiscount,
          afterDiscount: incomeStats.afterDiscount,
          boxes: incomeStats.boxes,
          shippingProviders: incomeStats.shippingProviders,
          ads: {
            totalAdsCost,
            liveAdsCost,
            shopAdsCost,
            percentages,
            metrics: {
              roiProtect: metricsAgg.roiProtect,
              fullRefundGmv: metricsAgg.fullRefundGmv,
              tinRefundAmount: metricsAgg.tinRefundAmount,
              adsTax: metricsAgg.adsTax,
              gmvAds: metricsAgg.gmvAds,
              affiliateCost: metricsAgg.affiliateCost,
              affiliateRefundAmount: metricsAgg.affiliateRefundAmount,
              incomeBeforeDiscount: metricsAgg.incomeBeforeDiscount,
              incomeAfterDiscount: metricsAgg.incomeAfterDiscount,
              actualAdsCost: metricsAgg.actualAdsCost,
              totalCost: metricsAgg.totalCost,
              costAfterRefund: metricsAgg.costAfterRefund,
              ratios: {
                adsRatioOnBeforeDiscountRevenue:
                  adsRatioOnBeforeDiscountRevenue,
                totalCostRatioOnBeforeDiscountRevenue:
                  metricsAgg.totalCostRatioOnBeforeDiscountRevenue,
                costAfterRefundRatioOnBeforeDiscountRevenue:
                  metricsAgg.costAfterRefundRatioOnBeforeDiscountRevenue,
                affiliateRatioOnBeforeDiscountRevenue:
                  metricsAgg.affiliateRatioOnBeforeDiscountRevenue
              },
              recordsCount: metricsAgg.recordsCount
            }
          },
          discounts: incomeStats.discounts,
          orders: incomeStats.orders,
          productsQuantity: incomeStats.productsQuantity
        }
      }

      const prevStart = new Date(start.getTime() - rangeDurationMs)
      const prevEnd = new Date(end.getTime() - rangeDurationMs)
      const currentPromise = buildStats(start, end)
      const previousPromise = comparePrevious
        ? buildStats(prevStart, prevEnd)
        : Promise.resolve(null)
      const [current, previous] = await Promise.all([
        currentPromise,
        previousPromise
      ])

      // Add daily goal calculation if start and end are on the same day
      if (
        start.getDate() === end.getDate() &&
        start.getMonth() === end.getMonth() &&
        start.getFullYear() === end.getFullYear()
      ) {
        const month = start.getMonth()
        const year = start.getFullYear()

        // Get month goal
        const goalFilter: any = { month, year }
        if (channelId) goalFilter.channel = channelId

        const monthGoal = await this.monthGoalModel.findOne(goalFilter).lean()

        if (monthGoal) {
          // Calculate days in month
          const daysInMonth = new Date(year, month + 1, 0).getDate()

          // Calculate daily goals (income goals divided by days in month)
          const dailyLiveGoal = monthGoal.liveStreamGoal / daysInMonth
          const dailyShopGoal = monthGoal.shopGoal / daysInMonth
          const dailyTotalGoal = dailyLiveGoal + dailyShopGoal

          // Calculate income percentages - BEFORE DISCOUNT
          const liveIncomePercentageBeforeDiscount =
            dailyLiveGoal === 0
              ? 0
              : Math.round(
                  (current.beforeDiscount.liveIncome / dailyLiveGoal) *
                    100 *
                    100
                ) / 100

          const shopIncomePercentageBeforeDiscount =
            dailyShopGoal === 0
              ? 0
              : Math.round(
                  ((current.beforeDiscount.videoIncome +
                    current.beforeDiscount.otherIncome) /
                    dailyShopGoal) *
                    100 *
                    100
                ) / 100

          const incomePercentageBeforeDiscount =
            dailyTotalGoal === 0
              ? 0
              : Math.round(
                  (current.beforeDiscount.totalIncome / dailyTotalGoal) *
                    100 *
                    100
                ) / 100

          // Calculate income percentages - AFTER DISCOUNT
          const liveIncomePercentageAfterDiscount =
            dailyLiveGoal === 0
              ? 0
              : Math.round(
                  (current.afterDiscount.liveIncome / dailyLiveGoal) * 100 * 100
                ) / 100

          const shopIncomePercentageAfterDiscount =
            dailyShopGoal === 0
              ? 0
              : Math.round(
                  ((current.afterDiscount.videoIncome +
                    current.afterDiscount.otherIncome) /
                    dailyShopGoal) *
                    100 *
                    100
                ) / 100

          const incomePercentageAfterDiscount =
            dailyTotalGoal === 0
              ? 0
              : Math.round(
                  (current.afterDiscount.totalIncome / dailyTotalGoal) *
                    100 *
                    100
                ) / 100

          ;(current as any).dailyGoal = {
            beforeDiscount: {
              liveIncomePercentage: liveIncomePercentageBeforeDiscount,
              shopIncomePercentage: shopIncomePercentageBeforeDiscount,
              incomePercentage: incomePercentageBeforeDiscount
            },
            afterDiscount: {
              liveIncomePercentage: liveIncomePercentageAfterDiscount,
              shopIncomePercentage: shopIncomePercentageAfterDiscount,
              incomePercentage: incomePercentageAfterDiscount
            },
            goals: {
              dailyLiveIncomeGoal: dailyLiveGoal,
              dailyShopIncomeGoal: dailyShopGoal,
              dailyTotalIncomeGoal: dailyTotalGoal
            }
          }
        }
      }

      if (!comparePrevious)
        return { period: { startDate: start, endDate: end, days }, current }

      const pct = (cur: number, prev: number) =>
        prev === 0
          ? cur === 0
            ? 0
            : 100
          : Math.round(((cur - prev) / prev) * 10000) / 100

      const changes = {
        beforeDiscount: {
          totalIncomePct: pct(
            current.beforeDiscount.totalIncome,
            previous.beforeDiscount.totalIncome
          ),
          liveIncomePct: pct(
            current.beforeDiscount.liveIncome,
            previous.beforeDiscount.liveIncome
          ),
          videoIncomePct: pct(
            current.beforeDiscount.videoIncome,
            previous.beforeDiscount.videoIncome
          ),
          ownVideoIncomePct: pct(
            current.beforeDiscount.ownVideoIncome,
            previous.beforeDiscount.ownVideoIncome
          ),
          otherVideoIncomePct: pct(
            current.beforeDiscount.otherVideoIncome,
            previous.beforeDiscount.otherVideoIncome
          ),
          sources: {
            adsPct: pct(
              current.beforeDiscount.sources.ads,
              previous.beforeDiscount.sources.ads
            ),
            affiliatePct: pct(
              current.beforeDiscount.sources.affiliate,
              previous.beforeDiscount.sources.affiliate
            ),
            affiliateAdsPct: pct(
              current.beforeDiscount.sources.affiliateAds,
              previous.beforeDiscount.sources.affiliateAds
            ),
            otherPct: pct(
              current.beforeDiscount.sources.other,
              previous.beforeDiscount.sources.other
            )
          }
        },
        afterDiscount: {
          totalIncomePct: pct(
            current.afterDiscount.totalIncome,
            previous.afterDiscount.totalIncome
          ),
          liveIncomePct: pct(
            current.afterDiscount.liveIncome,
            previous.afterDiscount.liveIncome
          ),
          videoIncomePct: pct(
            current.afterDiscount.videoIncome,
            previous.afterDiscount.videoIncome
          ),
          ownVideoIncomePct: pct(
            current.afterDiscount.ownVideoIncome,
            previous.afterDiscount.ownVideoIncome
          ),
          otherVideoIncomePct: pct(
            current.afterDiscount.otherVideoIncome,
            previous.afterDiscount.otherVideoIncome
          ),
          sources: {
            adsPct: pct(
              current.afterDiscount.sources.ads,
              previous.afterDiscount.sources.ads
            ),
            affiliatePct: pct(
              current.afterDiscount.sources.affiliate,
              previous.afterDiscount.sources.affiliate
            ),
            affiliateAdsPct: pct(
              current.afterDiscount.sources.affiliateAds,
              previous.afterDiscount.sources.affiliateAds
            ),
            otherPct: pct(
              current.afterDiscount.sources.other,
              previous.afterDiscount.sources.other
            )
          }
        },
        ads: {
          totalAdsCostPct: pct(
            current.ads.totalAdsCost,
            previous.ads.totalAdsCost
          ),
          liveAdsCostPct: pct(
            current.ads.liveAdsCost,
            previous.ads.liveAdsCost
          ),
          shopAdsCostPct: pct(
            current.ads.shopAdsCost,
            previous.ads.shopAdsCost
          ),
          liveAdsToLiveIncomePctDiff:
            Math.round(
              (current.ads.percentages.liveAdsToLiveIncome -
                previous.ads.percentages.liveAdsToLiveIncome) *
                100
            ) / 100,
          shopAdsToShopIncomePctDiff:
            Math.round(
              (current.ads.percentages.shopAdsToShopIncome -
                previous.ads.percentages.shopAdsToShopIncome) *
                100
            ) / 100,
          actualAdsCostPct: pct(
            current.ads.metrics.actualAdsCost,
            previous.ads.metrics.actualAdsCost
          ),
          totalCostPct: pct(
            current.ads.metrics.totalCost,
            previous.ads.metrics.totalCost
          ),
          costAfterRefundPct: pct(
            current.ads.metrics.costAfterRefund,
            previous.ads.metrics.costAfterRefund
          ),
          adsRatioOnBeforeDiscountRevenueDiff:
            Math.round(
              (current.ads.metrics.ratios.adsRatioOnBeforeDiscountRevenue -
                previous.ads.metrics.ratios.adsRatioOnBeforeDiscountRevenue) *
                100
            ) / 100,
          totalCostRatioOnBeforeDiscountRevenueDiff:
            Math.round(
              (current.ads.metrics.ratios
                .totalCostRatioOnBeforeDiscountRevenue -
                previous.ads.metrics.ratios
                  .totalCostRatioOnBeforeDiscountRevenue) *
                100
            ) / 100,
          costAfterRefundRatioOnBeforeDiscountRevenueDiff:
            Math.round(
              (current.ads.metrics.ratios
                .costAfterRefundRatioOnBeforeDiscountRevenue -
                previous.ads.metrics.ratios
                  .costAfterRefundRatioOnBeforeDiscountRevenue) *
                100
            ) / 100
        },
        discounts: {
          totalPlatformDiscountPct: pct(
            current.discounts.totalPlatformDiscount,
            previous.discounts.totalPlatformDiscount
          ),
          totalSellerDiscountPct: pct(
            current.discounts.totalSellerDiscount,
            previous.discounts.totalSellerDiscount
          ),
          totalDiscountPct: pct(
            current.discounts.totalDiscount,
            previous.discounts.totalDiscount
          ),
          avgDiscountPerOrderPct: pct(
            current.discounts.avgDiscountPerOrder,
            previous.discounts.avgDiscountPerOrder
          ),
          discountPercentageDiff:
            Math.round(
              (current.discounts.discountPercentage -
                previous.discounts.discountPercentage) *
                100
            ) / 100
        },
        orders: {
          totalPct: pct(current.orders.total, previous.orders.total),
          livePct: pct(current.orders.live, previous.orders.live),
          shopPct: pct(current.orders.shop, previous.orders.shop)
        }
      }

      return {
        period: { startDate: start, endDate: end, days },
        current,
        changes
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi tính thống kê chuỗi ngày",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async insertAndUpdateAffiliateType(dto: {
    totalIncomeFile: Express.Multer.File
    affiliateFile?: Express.Multer.File
    date: Date
    channel: string
    updateMode?: "full" | "status-only"
  }): Promise<void> {
    try {
      // ====== 0) Date range ======
      const start = new Date(dto.date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(dto.date)
      end.setHours(23, 59, 59, 999)

      if (dto.updateMode === "status-only") {
        await this.updateIncomeStatusesFromFile({
          totalIncomeFile: dto.totalIncomeFile,
          date: dto.date,
          channel: dto.channel
        })
        return
      }

      // ====== 1) Xử lý file tổng doanh thu: insert với source mặc định "other" + sourceChecked=false ======
      const totalWorkbook = XLSX.read(dto.totalIncomeFile.buffer, {
        type: "buffer"
      })
      const totalSheetName = totalWorkbook.SheetNames[0]
      const totalSheet = totalWorkbook.Sheets[totalSheetName]
      const totalReadData = XLSX.utils.sheet_to_json(
        totalSheet
      ) as XlsxIncomeData[]
      const totalData = totalReadData
        .slice(1)
        .filter((line) => line["Cancelation/Return Type"] !== "Cancel")

      // Xóa incomes trong ngày nhưng chỉ cho channel này
      await this.incomeModel.deleteMany({
        date: { $gte: start, $lte: end },
        channel: dto.channel
      })

      // Group theo orderId
      const newIncomesMap = totalData.reduce(
        (acc, line) => {
          const orderId = String(line["Order ID"] || "").trim()
          if (!orderId) return acc
          if (!acc[orderId]) acc[orderId] = []
          acc[orderId].push(line)
          return acc
        },
        {} as Record<string, XlsxIncomeData[]>
      )

      const inserts: any[] = []
      for (const orderId of Object.keys(newIncomesMap)) {
        const lines = newIncomesMap[orderId]
        const shippingProvider = this.getShippingProviderName(lines[0] as any)

        const products = lines.map((line) => ({
          code: String(line["Seller SKU"] || "").trim(),
          name: String(line["Product Name"] || "").trim(),
          source: "other",
          quantity: Number(line["Quantity"]) || 0,
          quotation: Number(line["SKU Unit Original Price"]) || 0,
          price: Number(line["SKU Subtotal Before Discount"]) || 0,
          platformDiscount: Number(line["SKU Platform Discount"]) || 0,
          sellerDiscount: Number(line["SKU Seller Discount"]) || 0,
          priceAfterDiscount: Number(line["SKU Subtotal After Discount"]) || 0,
          sourceChecked: false
        }))

        inserts.push({
          orderId,
          customer: lines[0]["Buyer Username"] || "user",
          province: lines[0]["Province"] || "",
          shippingProvider,
          ...this.buildIncomeStatusPayload(lines[0]),
          channel: dto.channel,
          date: dto.date,
          products
        })
      }

      if (inserts.length) {
        await this.incomeModel.insertMany(inserts, { ordered: false })
      }

      // Cập nhật quy cách đóng hộp
      await this.updateIncomesBox(new Date(dto.date))

      // ====== 2) Xử lý file affiliate: update source (FIX RACE + IDEMPOTENT) ======
      const channelDoc = await this.livestreamChannelModel
        .findById(dto.channel, { usernames: 1, username: 1 })
        .lean()
      const channelUsernames = new Set(
        [
          ...(channelDoc?.usernames || []),
          ...(channelDoc?.username ? [channelDoc.username] : [])
        ]
          .map((name) =>
            String(name || "")
              .trim()
              .toLowerCase()
          )
          .filter(Boolean)
      )

      const normalizeCreator = (value: unknown) =>
        String(value || "")
          .trim()
          .toLowerCase()

      if (!dto.affiliateFile) {
        throw new HttpException(
          "Thiếu file affiliate cho chế độ full",
          HttpStatus.BAD_REQUEST
        )
      }

      const affiliateWorkbook = XLSX.read(dto.affiliateFile.buffer, {
        type: "buffer"
      })
      const affiliateSheetName = affiliateWorkbook.SheetNames[0]
      const affiliateSheet = affiliateWorkbook.Sheets[affiliateSheetName]
      const affiliateData = XLSX.utils.sheet_to_json(
        affiliateSheet
      ) as XlsxAffiliateData[]

      // Optional: thống kê để debug
      let updatedCount = 0
      let noopCount = 0

      for (const line of affiliateData) {
        const orderId = String(line["ID đơn hàng"] || "").trim()
        const code = String(line["Sku người bán"] || "").trim()
        const quantity = Number(line["Số lượng"])

        if (!orderId || !code || !Number.isFinite(quantity)) continue

        const creator = line["Tên người dùng nhà sáng tạo"]
        const nextSource = channelUsernames.has(normalizeCreator(creator))
          ? "ads"
          : line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"] &&
              !line["Tỷ lệ hoa hồng tiêu chuẩn"]
            ? "affiliate-ads"
            : line["Tỷ lệ hoa hồng tiêu chuẩn"] &&
                !line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
              ? "affiliate"
              : "other"

        const affiliateAdsPercentage = Number(
          line["Tỷ lệ hoa hồng Quảng cáo cửa hàng"]
        )
        const affiliateAdsAmount = Number(
          line["Thanh toán hoa hồng Quảng cáo cửa hàng ước tính"]
        )
        const standardAffPercentage = Number(line["Tỷ lệ hoa hồng tiêu chuẩn"])
        const standardAffAmount = Number(
          line["Thanh toán hoa hồng tiêu chuẩn ước tính"]
        )
        const content = line["Loại nội dung"]

        // Atomic update: chỉ update nếu có phần tử products match + sourceChecked=false
        const res = await this.incomeModel.updateOne(
          {
            orderId,
            channel: dto.channel,
            date: { $gte: start, $lte: end },
            products: { $elemMatch: { code, quantity, sourceChecked: false } }
          },
          {
            $set: {
              "products.$[p].sourceChecked": true,
              "products.$[p].creator": creator,
              "products.$[p].source": nextSource,
              "products.$[p].content": content,
              "products.$[p].affiliateAdsPercentage": isNaN(
                affiliateAdsPercentage
              )
                ? 0
                : affiliateAdsPercentage,
              "products.$[p].affiliateAdsAmount": isNaN(affiliateAdsAmount)
                ? 0
                : affiliateAdsAmount,
              "products.$[p].standardAffPercentage": isNaN(
                standardAffPercentage
              )
                ? 0
                : standardAffPercentage,
              "products.$[p].standardAffAmount": isNaN(standardAffAmount)
                ? 0
                : standardAffAmount
            }
          },
          {
            arrayFilters: [
              {
                "p.code": code,
                "p.quantity": quantity,
                "p.sourceChecked": false
              }
            ]
          }
        )

        // res.matchedCount == 0: hoặc order không tồn tại, hoặc product đã được check (trùng dòng), hoặc code/qty không match
        if ((res as any).modifiedCount > 0) updatedCount++
        else noopCount++

        // Nếu bạn vẫn muốn debug riêng 1 orderId:
        // if (orderId === "581632382653597228") {
        //   console.log("affiliate update result:", res)
        // }
      }

      // Optional log tổng (tuỳ bạn giữ hay bỏ)
      // console.log(`[AffiliateUpdate] updated=${updatedCount}, noop=${noopCount}`)
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi xử lý file tổng doanh thu và affiliate",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateIncomeStatusesFromFile(dto: {
    totalIncomeFile: Express.Multer.File
    date: Date
    channel: string
  }): Promise<{ matched: number; modified: number; missing: number }> {
    try {
      const start = new Date(dto.date)
      start.setHours(0, 0, 0, 0)
      const end = new Date(dto.date)
      end.setHours(23, 59, 59, 999)

      const workbook = XLSX.read(dto.totalIncomeFile.buffer, { type: "buffer" })
      const sheetName = workbook.SheetNames[0]
      const sheet = workbook.Sheets[sheetName]
      const readData = XLSX.utils.sheet_to_json(sheet) as XlsxIncomeData[]
      const totalData = readData.slice(1)

      const statusesByOrderId = totalData.reduce(
        (acc, line) => {
          const orderId = String(line["Order ID"] || "").trim()
          if (!orderId) return acc
          acc[orderId] = this.buildIncomeStatusPayload(line)
          return acc
        },
        {} as Record<
          string,
          ReturnType<IncomeService["buildIncomeStatusPayload"]>
        >
      )

      let matched = 0
      let modified = 0

      for (const [orderId, statusPayload] of Object.entries(
        statusesByOrderId
      )) {
        const res = await this.incomeModel.updateMany(
          {
            orderId,
            channel: dto.channel,
            date: { $gte: start, $lte: end }
          },
          {
            $set: statusPayload
          }
        )

        matched += Number((res as any).matchedCount || 0)
        modified += Number((res as any).modifiedCount || 0)
      }

      return {
        matched,
        modified,
        missing: Math.max(0, Object.keys(statusesByOrderId).length - matched)
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi cập nhật trạng thái đơn hàng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getDetailedProductStats(
    startDate: Date,
    endDate: Date,
    page = 1,
    limit = 20
  ): Promise<{
    products: Array<{
      code: string
      name: string
      totalQuantity: number
      totalOriginalPrice: number
      totalPlatformDiscount: number
      totalSellerDiscount: number
      totalPriceAfterDiscount: number
      avgDiscountPercentage: number
      orderCount: number
    }>
    total: number
  }> {
    try {
      const start = new Date(startDate)
      start.setHours(0, 0, 0, 0)
      const end = new Date(endDate)
      end.setHours(23, 59, 59, 999)

      const pipeline = [
        { $match: { date: { $gte: start, $lte: end } } },
        { $unwind: "$products" },
        {
          $group: {
            _id: {
              code: "$products.code",
              name: "$products.name"
            },
            totalQuantity: { $sum: "$products.quantity" },
            totalOriginalPrice: { $sum: { $ifNull: ["$products.price", 0] } },
            totalPlatformDiscount: {
              $sum: { $ifNull: ["$products.platformDiscount", 0] }
            },
            totalSellerDiscount: {
              $sum: { $ifNull: ["$products.sellerDiscount", 0] }
            },
            totalPriceAfterDiscount: {
              $sum: {
                $ifNull: ["$products.priceAfterDiscount", "$products.price"]
              }
            },
            orderCount: { $sum: 1 }
          }
        },
        {
          $addFields: {
            avgDiscountPercentage: {
              $cond: {
                if: { $gt: ["$totalOriginalPrice", 0] },
                then: {
                  $multiply: [
                    {
                      $divide: [
                        {
                          $add: [
                            "$totalPlatformDiscount",
                            "$totalSellerDiscount"
                          ]
                        },
                        "$totalOriginalPrice"
                      ]
                    },
                    100
                  ]
                },
                else: 0
              }
            }
          }
        },
        { $sort: { totalOriginalPrice: -1 } }
      ]

      const [results, totalCount] = await Promise.all([
        this.incomeModel.aggregate([
          ...pipeline,
          { $skip: (page - 1) * limit },
          { $limit: limit }
        ] as any),
        this.incomeModel.aggregate([...pipeline, { $count: "total" }] as any)
      ])

      const products = results.map((item) => ({
        code: item._id.code,
        name: item._id.name,
        totalQuantity: item.totalQuantity,
        totalOriginalPrice: item.totalOriginalPrice,
        totalPlatformDiscount: item.totalPlatformDiscount,
        totalSellerDiscount: item.totalSellerDiscount,
        totalPriceAfterDiscount: item.totalPriceAfterDiscount,
        avgDiscountPercentage:
          Math.round(item.avgDiscountPercentage * 100) / 100,
        orderCount: item.orderCount
      }))

      return {
        products,
        total: totalCount[0]?.total || 0
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi lấy thống kê chi tiết sản phẩm",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async getTotalIncomeCountByMonth(
    month: number,
    year: number,
    channelId?: string
  ): Promise<{ totalCount: number }> {
    try {
      // Adjust for GMT+7 timezone (Vietnam time)
      const start = new Date(Date.UTC(year, month, 1))
      start.setUTCHours(start.getUTCHours() - 7)

      const end = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      end.setUTCHours(end.getUTCHours() - 7)

      console.log(start, end)

      // Filter by month, year, and channel
      const filter: any = {
        date: { $gte: start, $lte: end }
      }
      if (channelId) filter.channel = channelId

      const totalCount = await this.incomeModel.countDocuments(filter)

      return { totalCount }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Lỗi khi đếm số đơn hàng theo tháng",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private splitByChannel(products: Income["products"]) {
    const isLive = (p: any) =>
      typeof p.content === "string" &&
      /Phát trực tiếp|livestream/i.test(p.content)
    const live = products.filter(isLive)
    const shop = products.filter((p) => !isLive(p))
    return { live, shop }
  }

  private sumProductsAmountBeforeDiscount(products: any[]) {
    return products.reduce((sum, p) => sum + (p.price || 0), 0)
  }

  private sumProductsAmountAfterSellerDiscount(products: any[]) {
    return products.reduce((sum, p) => {
      const priceBeforeDiscount = p.price || 0
      const sellerDiscount = p.sellerDiscount || 0
      return sum + (priceBeforeDiscount - sellerDiscount)
    }, 0)
  }

  private sumProductsQuantity(products: any[]) {
    return products.reduce((sum, p) => sum + (p.quantity || 0), 0)
  }

  private getActualPrice(product: any): number {
    // CẢNH BÁO: Hàm này trừ CẢ PLATFORM + SELLER DISCOUNT
    // Không dùng cho business logic chỉ trừ seller discount
    return product.priceAfterDiscount || product.price || 0
  }

  private getShippingProviderName(
    row: Record<string, any>
  ): string | undefined {
    if (!row) return undefined
    const directKeys = [
      "Shipping Provider Name",
      "Shipping Provider",
      "Đơn vị vận chuyển",
      "Tên đơn vị vận chuyển",
      "Logistics Service Provider",
      "Carrier"
    ]

    for (const k of directKeys) {
      if (row[k]) return String(row[k])
    }

    const key = Object.keys(row).find((k) =>
      k.toLowerCase().includes("shipping provider")
    )
    return key ? String(row[key]) : undefined
  }

  private formatDate(d: Date): string {
    if (!(d instanceof Date) || isNaN(d.getTime())) return ""
    try {
      return formatDateFns(d, "dd/MM/yyyy")
    } catch {
      return ""
    }
  }

  private formatMoney(v: any): string {
    if (v === undefined || v === null || v === "") return ""
    const num = Number(v)
    if (isNaN(num)) return ""
    return new Intl.NumberFormat("vi-VN").format(num)
  }
}
