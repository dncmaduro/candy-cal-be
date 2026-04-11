export class CreateShopeeDailyAdsDto {
  date: Date
  channel: string
  adsCost: number
}

export class UpdateShopeeDailyAdsDto {
  date?: Date
  channel?: string
  adsCost?: number
}
