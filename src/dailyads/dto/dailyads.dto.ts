export class DailyAdsDto {
  date: Date
  liveAdsCost: number
  shopAdsCost: number
  currency?: "vnd" | "usd"
}

export class SimpleDailyAdsDto {
  date: string
  liveAdsCost: number
  shopAdsCost: number
  currency?: "vnd" | "usd"
  channel?: string
}
