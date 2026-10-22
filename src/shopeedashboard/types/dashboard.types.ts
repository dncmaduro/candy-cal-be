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
    beforeCancellation: {
      revenue: number
      orders: number
      adsCost: number
      roas: number
    }
    afterCancellation: {
      revenue: number
      orders: number
      adsCost: number
      roas: number
    }
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
    orderFrom: string
    orderTo: string
    days: number
  }
  summary: {
    grossRevenue: number
    netRevenue: number
    grossOrders: number
    netOrders: number
    cancelledRevenue: number
    cancelledOrders: number
    liveRevenue: number
    adsCost: number
    totalOrders: number
    roas: number
    aov: number
    revenuePerDay: number
    ordersPerDay: number
    adsCostPerDay: number
    beforeCancellation: {
      revenue: number
      orders: number
      adsCost: number
      roas: number
      aov: number
    }
    afterCancellation: {
      revenue: number
      orders: number
      adsCost: number
      roas: number
      aov: number
    }
  }
  meta: {
    lastSyncedAt: string | null
    timezone: string
    currency: "VND"
    isPartialToday: boolean
  }
}

export type RangeTimeseriesPoint = {
  orderDate: string
  grossRevenue: number
  grossOrders: number
  revenue: number
  liveRevenue: number
  grossAdsCost: number
  netAdsCost: number
  adsCost: number
  orders: number
  grossRoas: number
  roas: number
  aov: number
}

export type RangeTimeseriesResponse = {
  scope: {
    type: "range"
    channel: string
    orderFrom: string
    orderTo: string
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
    orderFrom?: string
    orderTo?: string
  }
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
  items: Array<{
    orderDate: string
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
