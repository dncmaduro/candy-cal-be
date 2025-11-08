export class CreateMonthGoalDto {
  month: number
  year: number
  channel?: string
  liveStreamGoal: number
  shopGoal: number
  liveAdsPercentageGoal: number
  shopAdsPercentageGoal: number
}

export class UpdateMonthGoalDto {
  month: number
  year: number
  channel?: string
  liveStreamGoal: number
  shopGoal: number
  liveAdsPercentageGoal: number
  shopAdsPercentageGoal: number
}
