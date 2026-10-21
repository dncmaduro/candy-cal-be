export class CreateShopeeDailyAdsDto {
  date: Date
  channel: string
  adsCost?: number
  adsCostBeforeCancellation?: number
  adsCostAfterCancellation?: number
}

export class UpdateShopeeDailyAdsDto {
  date?: Date
  channel?: string
  adsCost?: number
  adsCostBeforeCancellation?: number
  adsCostAfterCancellation?: number
}
