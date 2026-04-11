export type MonthlySummaryResponse = {
  scope: {
    type: "monthly"
    channel: string
    month: number
    year: number
  }
  summary: {
    currentRevenue: number
    revenueTarget: number
    liveRevenue: number
    adsCost: number
    adsCostTarget: number
    roas: number
    roasTarget: number
    totalOrders: number
    expectedProgressPercent: number
    actualRevenueProgressPercent: number
    actualAdsCostProgressPercent: number
    actualRoasProgressPercent: number
  }
  meta: {
    lastSyncedAt: string | null
    timezone: string
    currency: "VND"
  }
}

export type MonthlyKpiItem = {
  key: "revenue" | "adsCost" | "roas"
  label: string
  actual: number
  target: number
  expectedProgressPercent: number
  actualProgressPercent: number
  deltaPercent: number
  speedMultiplier: number
  status: "ahead" | "behind" | "on_track" | "no_target"
}

export type MonthlyKpisResponse = {
  scope: {
    type: "monthly"
    channel: string
    month: number
    year: number
  }
  kpis: MonthlyKpiItem[]
  meta: {
    lastSyncedAt: string | null
    timezone: string
    currency: "VND"
  }
}

export type RangeSummaryResponse = {
  scope: {
    type: "range"
    channel: string
    from: string
    to: string
    days: number
  }
  summary: {
    grossRevenue: number
    netRevenue: number
    liveRevenue: number
    adsCost: number
    totalOrders: number
    roas: number
    aov: number
    revenuePerDay: number
    ordersPerDay: number
    adsCostPerDay: number
  }
  meta: {
    lastSyncedAt: string | null
    timezone: string
    currency: "VND"
    isPartialToday: boolean
  }
}

export type RangeTimeseriesPoint = {
  date: string
  revenue: number
  liveRevenue: number
  adsCost: number
  orders: number
  roas: number
  aov: number
}

export type RangeTimeseriesResponse = {
  scope: {
    type: "range"
    channel: string
    from: string
    to: string
    days: number
  }
  series: RangeTimeseriesPoint[]
  meta: {
    lastSyncedAt: string | null
    timezone: string
    currency: "VND"
    isPartialToday: boolean
  }
}

export type OrdersListResponse = {
  scope: {
    type: "monthly" | "range"
    channel: string
    month?: number
    year?: number
    from?: string
    to?: string
  }
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  items: Array<{
    date: string
    orderCode: string
    customerName: string | null
    shop: string | null
    productName: string
    revenue: number
    productCount: number
  }>
  meta: {
    lastSyncedAt: string | null
    timezone: string
    currency: "VND"
  }
}
