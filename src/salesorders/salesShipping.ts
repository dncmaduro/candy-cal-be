export const JNT_SHIPPING_MIN_FEE = 30000
export const JNT_SHIPPING_6_TO_10_KG_FEE = 35000
export const JNT_SHIPPING_11_TO_15_KG_FEE = 45000
export const JNT_SHIPPING_16_KG_FEE = 50000
export const JNT_SHIPPING_INCREMENTAL_FEE = 5000

export type JntShippingItem = {
  area?: number | null
  mass?: number | null
  quantity: number
}

const toNonNegativeNumber = (value?: number | null) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0

export const calculateJntVolumetricWeight = (area?: number | null) =>
  (toNonNegativeNumber(area) * 1000) / 6

export const calculateJntChargeableWeight = (item: JntShippingItem) =>
  Math.round(
    Math.max(
      calculateJntVolumetricWeight(item.area),
      toNonNegativeNumber(item.mass)
    )
  )

export const calculateJntShippingCostForBox = (item: JntShippingItem) => {
  const chargeableWeight = calculateJntChargeableWeight(item)

  if (chargeableWeight <= 5) return JNT_SHIPPING_MIN_FEE
  if (chargeableWeight <= 10) return JNT_SHIPPING_6_TO_10_KG_FEE
  if (chargeableWeight <= 15) return JNT_SHIPPING_11_TO_15_KG_FEE

  return (
    JNT_SHIPPING_16_KG_FEE +
    (chargeableWeight - 16) * JNT_SHIPPING_INCREMENTAL_FEE
  )
}

export const calculateJntShippingCost = (items: JntShippingItem[]) =>
  items.reduce((total, item) => {
    const quantity = toNonNegativeNumber(item.quantity)
    return total + calculateJntShippingCostForBox(item) * quantity
  }, 0)
