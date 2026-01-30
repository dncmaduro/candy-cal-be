import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Patch,
  Post,
  Query,
  Res,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  Req
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { Roles } from "../roles/roles.decorator"
import { IncomeService } from "./income.service"
import { InsertIncomeRequest } from "./dto/income.dto"
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express"
import { Income } from "../database/mongoose/schemas/Income"
import { Response } from "express"
import { SystemLogsService } from "../systemlogs/systemlogs.service"
import { NotificationsService } from "../notifications/notifications.service"

@Controller("incomes")
@UseGuards(JwtAuthGuard, RolesGuard)
export class IncomeController {
  constructor(
    private readonly incomeService: IncomeService,
    private readonly systemLogsService: SystemLogsService,
    private readonly notificationsService: NotificationsService
  ) {}

  /** @deprecated */
  @Roles("admin", "accounting-emp")
  @Post("")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.CREATED)
  async insertIncome(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: InsertIncomeRequest,
    @Req() req
  ): Promise<{ success: true }> {
    await this.incomeService.insertIncome({ ...body, file })
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "inserted",
        entity: "income",
        result: "success",
        meta: { type: body.type, fileSize: file?.size, channel: body.channel }
      },
      req.user.userId
    )
    return { success: true }
  }

  @Roles("admin", "accounting-emp")
  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteIncomeByDate(
    @Query("date") date: string,
    @Req() req
  ): Promise<void> {
    await this.incomeService.deleteIncomeByDate(new Date(date))
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "deleted_by_date",
        entity: "income",
        result: "success",
        meta: { date }
      },
      req.user.userId
    )
  }

  /** @deprecated */
  @Roles("admin", "accounting-emp")
  @Post("update-affiliate")
  @UseInterceptors(FileInterceptor("file"))
  @HttpCode(HttpStatus.OK)
  async updateAffiliateType(
    @UploadedFile() file: Express.Multer.File,
    @Req() req
  ): Promise<{ success: true }> {
    await this.incomeService.updateAffiliateType({ file })
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "update_affiliate",
        entity: "income",
        result: "success",
        meta: { fileSize: file?.size }
      },
      req.user.userId
    )
    return { success: true }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get()
  @HttpCode(HttpStatus.OK)
  async getIncomesByDateRange(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("page") page = 1,
    @Query("limit") limit = 10,
    @Query("orderId") orderId?: string,
    @Query("productCode") productCode?: string,
    @Query("productSource") productSource?: string,
    @Query("channelId") channelId?: string
  ): Promise<{ incomes: Income[]; total: number }> {
    const data = await this.incomeService.getIncomesByDateRange(
      new Date(startDate),
      new Date(endDate),
      Number(page),
      Number(limit),
      orderId,
      productCode,
      productSource,
      channelId
    )
    return data
  }

  @Roles("admin", "accounting-emp")
  @Patch("update-box")
  @HttpCode(HttpStatus.OK)
  async updateIncomesBox(
    @Query("date") date: string,
    @Req() req
  ): Promise<{ success: true }> {
    await this.incomeService.updateIncomesBox(new Date(date))
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "update_box",
        entity: "income",
        result: "success",
        meta: { date }
      },
      req.user.userId
    )
    return { success: true }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("export-xlsx")
  async exportIncomesToXlsx(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Res() res: Response,
    @Query("productSource") productSource?: string,
    @Query("productCode") productCode?: string,
    @Query("orderId") orderId?: string,
    @Req() req?
  ): Promise<void> {
    const buffer = await this.incomeService.exportIncomesToXlsx(
      new Date(startDate),
      new Date(endDate),
      orderId,
      productCode,
      productSource
    )

    res.setHeader(
      "Content-Disposition",
      `attachment; filename=DoanhThu_${startDate}_${endDate}.xlsx`
    )
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )

    res.send(buffer)
    // best-effort log (no await)
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "export_xlsx",
        entity: "income",
        result: "success",
        meta: { startDate, endDate, productSource, productCode, orderId }
      },
      (req as any)?.user?.userId ?? "unknown"
    )
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("income-split-by-month")
  @HttpCode(HttpStatus.OK)
  async totalIncomeByMonthSplit(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string
  ): Promise<{
    totalIncome: {
      beforeDiscount: { live: number; shop: number }
      afterDiscount: { live: number; shop: number }
    }
  }> {
    const totalIncome = await this.incomeService.totalIncomeByMonthSplit(
      Number(month),
      Number(year),
      channelId
    )
    return { totalIncome }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("quantity-split-by-month")
  @HttpCode(HttpStatus.OK)
  async totalQuantityByMonthSplit(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string
  ): Promise<{ totalQuantity: { live: number; shop: number } }> {
    const totalQuantity = await this.incomeService.totalQuantityByMonthSplit(
      Number(month),
      Number(year),
      channelId
    )
    return { totalQuantity }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("total-orders-by-month")
  @HttpCode(HttpStatus.OK)
  async getTotalIncomeCountByMonth(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string
  ): Promise<{ totalCount: number }> {
    return this.incomeService.getTotalIncomeCountByMonth(
      Number(month),
      Number(year),
      channelId
    )
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("kpi-percentage-split-by-month")
  @HttpCode(HttpStatus.OK)
  async KPIPercentageByMonthSplit(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string
  ): Promise<{ KPIPercentage: { live: number; shop: number } }> {
    const KPIPercentage = await this.incomeService.KPIPercentageByMonthSplit(
      Number(month),
      Number(year),
      channelId
    )
    return { KPIPercentage }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("top-creators")
  @HttpCode(HttpStatus.OK)
  async getTopCreators(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string
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
    return this.incomeService.getTopCreators(
      new Date(startDate),
      new Date(endDate)
    )
  }

  @Roles("admin")
  @Patch("reset-source-checked")
  @HttpCode(HttpStatus.OK)
  async resetSourceChecked(
    @Query("date") date: string,
    @Req() req
  ): Promise<{ updated: number }> {
    const result = await this.incomeService.resetSourceChecked(new Date(date))
    void this.systemLogsService.createSystemLog(
      {
        type: "income",
        action: "reset_source_checked",
        entity: "income",
        result: "success",
        meta: { date, updated: result.updated }
      },
      req.user.userId
    )
    return result
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("monthly-live-shop-income")
  @HttpCode(HttpStatus.OK)
  async totalLiveAndShopIncomeByMonth(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string
  ): Promise<{
    totalIncome: {
      beforeDiscount: { live: number; shop: number }
      afterDiscount: { live: number; shop: number }
    }
  }> {
    const totalIncome = await this.incomeService.totalLiveAndShopIncomeByMonth(
      Number(month),
      Number(year),
      channelId
    )
    return { totalIncome }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("monthly-ads-cost-split")
  @HttpCode(HttpStatus.OK)
  async adsCostSplitByMonth(
    @Query("month") month: string,
    @Query("year") year: string,
    @Query("channelId") channelId?: string
  ): Promise<{
    liveAdsCost: number
    shopAdsCost: number
    percentages: { liveAdsToLiveIncome: number; shopAdsToShopIncome: number }
    totalIncome: { live: number; shop: number }
  }> {
    return this.incomeService.adsCostSplitByMonth(
      Number(month),
      Number(year),
      channelId
    )
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("range-stats")
  @HttpCode(HttpStatus.OK)
  async getRangeStats(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("channelId") channelId: string,
    @Query("comparePrevious") comparePrevious?: string
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
        liveAdsCost: number
        shopAdsCost: number
        percentages: {
          liveAdsToLiveIncome: number
          shopAdsToShopIncome: number
        }
      }
      discounts: {
        totalPlatformDiscount: number
        totalSellerDiscount: number
        totalDiscount: number
        avgDiscountPerOrder: number
        discountPercentage: number
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
        liveAdsCostPct: number
        shopAdsCostPct: number
        liveAdsToLiveIncomePctDiff: number
        shopAdsToShopIncomePctDiff: number
      }
      discounts: {
        totalPlatformDiscountPct: number
        totalSellerDiscountPct: number
        totalDiscountPct: number
        avgDiscountPerOrderPct: number
        discountPercentageDiff: number
      }
    }
  }> {
    return this.incomeService.getRangeStats(
      new Date(startDate),
      new Date(endDate),
      channelId,
      comparePrevious !== "false"
    )
  }

  @Roles("admin", "accounting-emp", "order-emp")
  @Post("insert-and-update-source")
  @UseInterceptors(FilesInterceptor("files"))
  @HttpCode(HttpStatus.ACCEPTED) // Đổi thành 202 ACCEPTED
  async insertAndUpdateAffiliateType(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { date: string; channel: string },
    @Req() req
  ): Promise<{ success: true; message: string }> {
    if (!files || files.length !== 2) {
      throw new HttpException(
        "Cần upload 2 file: file tổng doanh thu và file affiliate",
        HttpStatus.BAD_REQUEST
      )
    }
    const [totalIncomeFile, affiliateFile] = files

    // Chạy async trong background để tránh timeout
    setImmediate(async () => {
      try {
        await this.incomeService.insertAndUpdateAffiliateType({
          totalIncomeFile,
          affiliateFile,
          date: new Date(body.date),
          channel: body.channel
        })

        void this.systemLogsService.createSystemLog(
          {
            type: "income",
            action: "insert_and_update_affiliate_combined",
            entity: "income",
            result: "success",
            meta: {
              totalIncomeFileSize: totalIncomeFile?.size,
              affiliateFileSize: affiliateFile?.size
            }
          },
          req.user.userId
        )
        // Send notification to requester
        try {
          await this.notificationsService.createNotificationForSingleUser(
            {
              title: "Xử lý file doanh thu hoàn thành",
              content: `File đang xử lý cho ngày ${new Date(body.date).toLocaleDateString()} đã hoàn thành.`,
              createdAt: new Date(),
              type: "income_import"
            },
            req.user.userId
          )
        } catch (notifErr) {
          console.error("Failed to send notification:", notifErr)
        }
      } catch (error) {
        console.error("Background processing error:", error)
        void this.systemLogsService.createSystemLog(
          {
            type: "income",
            action: "insert_and_update_affiliate_combined",
            entity: "income",
            result: "failed",
            meta: {
              error: error.message,
              totalIncomeFileSize: totalIncomeFile?.size,
              affiliateFileSize: affiliateFile?.size
            }
          },
          req.user.userId
        )
        // Notify requester about failure
        try {
          await this.notificationsService.createNotificationForSingleUser(
            {
              title: "Xử lý file doanh thu thất bại",
              content: `Quá trình xử lý file cho ngày ${new Date(body.date).toLocaleDateString()} đã thất bại. Vui lòng liên hệ admin.`,
              createdAt: new Date(),
              type: "income_import"
            },
            req.user.userId
          )
        } catch (notifErr) {
          console.error("Failed to send failure notification:", notifErr)
        }
      }
    })

    // Trả response ngay lập tức
    return {
      success: true,
      message:
        "Đang xử lý file trong background. Vui lòng chờ vài phút để hoàn thành."
    }
  }

  @Roles("admin", "accounting-emp", "order-emp", "system-emp")
  @Get("detailed-product-stats")
  @HttpCode(HttpStatus.OK)
  async getDetailedProductStats(
    @Query("startDate") startDate: string,
    @Query("endDate") endDate: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20
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
    return this.incomeService.getDetailedProductStats(
      new Date(startDate),
      new Date(endDate),
      Number(page),
      Number(limit)
    )
  }
}
