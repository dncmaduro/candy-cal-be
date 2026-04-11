export class CreateShopeeMonthKpiDto {
  month: number
  year: number
  channel: string
  revenueKpi: number
  adsCostKpi: number
  roasKpi: number
}

export class UpdateShopeeMonthKpiDto {
  month?: number
  year?: number
  channel?: string
  revenueKpi?: number
  adsCostKpi?: number
  roasKpi?: number
}
