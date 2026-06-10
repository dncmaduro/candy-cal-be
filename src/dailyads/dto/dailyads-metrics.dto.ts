export class UpsertDailyAdsMetricsDto {
  date: string
  channelId: string
  roiProtect?: number
  fullRefundGmv?: number
  tinRefundAmount?: number
  adsTax?: number
  gmvAds?: number
  affiliateCost?: number
  affiliateRefundAmount?: number
}
