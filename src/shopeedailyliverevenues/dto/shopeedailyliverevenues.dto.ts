export class CreateShopeeDailyLiveRevenueDto {
  date: Date
  channel: string
  liveRevenue: number
}

export class UpdateShopeeDailyLiveRevenueDto {
  date?: Date
  channel?: string
  liveRevenue?: number
}
