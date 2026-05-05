type OrderLikeProduct = {
  content?: string
}

type OrderLike = {
  products?: OrderLikeProduct[]
}

export type OrderChannel = "live" | "shop"

export type OrderChannelCount = {
  total: number
  live: number
  shop: number
}

const LIVE_CONTENT_REGEX = /Phát trực tiếp|livestream/i

export const isLiveProduct = (product: OrderLikeProduct): boolean =>
  typeof product?.content === "string" && LIVE_CONTENT_REGEX.test(product.content)

export const classifyOrderChannel = (
  products: OrderLikeProduct[] = []
): OrderChannel => {
  let hasLive = false
  let hasShop = false

  for (const product of products) {
    if (isLiveProduct(product)) hasLive = true
    else hasShop = true

    if (hasLive && hasShop) break
  }

  // Mixed order rule: prioritize live so one order belongs to exactly one bucket.
  if (hasLive) return "live"
  if (hasShop) return "shop"

  // Empty-product edge case: keep totals consistent and avoid null buckets.
  return "shop"
}

export const countOrdersByChannel = (
  incomes: OrderLike[] = []
): OrderChannelCount => {
  const counts: OrderChannelCount = { total: 0, live: 0, shop: 0 }

  for (const income of incomes) {
    counts.total += 1
    const channel = classifyOrderChannel(income.products || [])
    counts[channel] += 1
  }

  return counts
}
