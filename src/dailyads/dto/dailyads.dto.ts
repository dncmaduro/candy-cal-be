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

export class DailyAdsV2Dto {
  date: Date
  internalAdsCost: number
  externalAdsCost: number
  currency?: "vnd" | "usd"
}

export class SimpleDailyAdsV2Dto {
  date: string
  internalAdsCost: number
  externalAdsCost: number
  currency?: "vnd" | "usd"
  channel?: string
}
