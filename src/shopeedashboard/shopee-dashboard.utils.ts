import { HttpException, HttpStatus } from "@nestjs/common"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

export const SHOPEE_TZ = "Asia/Ho_Chi_Minh"
export const SHOPEE_CURRENCY = "VND"
export const MAX_RANGE_DAYS = 92

export const ORDER_SORT_FIELDS = [
  "orderDate",
  "revenue",
  "orderCode",
  "productCount"
]

function isDateOnlyInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function fail(
  code: string,
  message: string,
  status: HttpStatus = HttpStatus.BAD_REQUEST
): never {
  throw new HttpException(
    {
      error: {
        code,
        message
      }
    },
    status
  )
}

export function toNumber(value: string | number, fallback = NaN): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function parseMonthYear(monthRaw: string, yearRaw: string) {
  const month = toNumber(monthRaw)
  const year = toNumber(yearRaw)

  if (!Number.isInteger(month) || month < 1 || month > 12) {
    fail("INVALID_MONTH", "Month must be an integer between 1 and 12.")
  }
  if (!Number.isInteger(year) || year < 2000 || year > 3000) {
    fail("INVALID_YEAR", "Year must be an integer between 2000 and 3000.")
  }
  return { month, year }
}

export function parseDateOnly(
  value: string,
  fieldName: string
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    fail(
      "INVALID_DATE",
      `${fieldName} must match YYYY-MM-DD format.`
    )
  }
  return value
}

export function startOfBusinessDate(dateText: string): Date {
  return fromZonedTime(`${dateText}T00:00:00`, SHOPEE_TZ)
}

export function endOfBusinessDate(dateText: string): Date {
  return fromZonedTime(`${dateText}T23:59:59.999`, SHOPEE_TZ)
}

export function startOfUtcDate(dateText: string): Date {
  return new Date(`${dateText}T00:00:00.000Z`)
}

export function endOfUtcDate(dateText: string): Date {
  return new Date(`${dateText}T23:59:59.999Z`)
}

export function parseOrderDateFilterDate(
  value: string,
  fieldName: string
): {
  date: Date
  dateText: string
  hasExplicitTime: boolean
} {
  const raw = String(value ?? "").trim()

  if (!raw) {
    fail("INVALID_DATE", `${fieldName} is required.`)
  }

  if (isDateOnlyInput(raw)) {
    const dateText = parseDateOnly(raw, fieldName)
    return {
      date: startOfUtcDate(dateText),
      dateText,
      hasExplicitTime: false
    }
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) {
    fail(
      "INVALID_DATE",
      `${fieldName} must be a valid YYYY-MM-DD or datetime value.`
    )
  }

  return {
    date: parsed,
    dateText: toBusinessDateText(parsed),
    hasExplicitTime: true
  }
}

export function parseOrderDateFilterStart(
  value: string,
  fieldName: string
): Date {
  const parsed = parseOrderDateFilterDate(value, fieldName)
  return parsed.hasExplicitTime ? parsed.date : startOfUtcDate(parsed.dateText)
}

export function parseOrderDateFilterEnd(
  value: string,
  fieldName: string
): Date {
  const parsed = parseOrderDateFilterDate(value, fieldName)
  return parsed.hasExplicitTime ? parsed.date : endOfUtcDate(parsed.dateText)
}

export function toBusinessDateText(date: Date): string {
  return formatInTimeZone(date, SHOPEE_TZ, "yyyy-MM-dd")
}

export function formatMetaDate(date: Date | null): string | null {
  if (!date) return null
  return formatInTimeZone(date, SHOPEE_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX")
}

export function monthRange(month: number, year: number): {
  fromText: string
  toText: string
  start: Date
  end: Date
} {
  const fromText = `${year}-${String(month).padStart(2, "0")}-01`
  const totalDays = new Date(year, month, 0).getDate()
  const toText = `${year}-${String(month).padStart(2, "0")}-${String(totalDays).padStart(2, "0")}`
  return {
    fromText,
    toText,
    start: startOfBusinessDate(fromText),
    end: endOfBusinessDate(toText)
  }
}

export function orderDateRange(
  orderFromRaw: string,
  orderToRaw: string
): {
  orderFrom: string
  orderTo: string
  start: Date
  end: Date
  businessStart: Date
  businessEnd: Date
  days: number
} {
  const fromInput = parseOrderDateFilterDate(orderFromRaw, "orderFrom")
  const toInput = parseOrderDateFilterDate(orderToRaw, "orderTo")
  const orderFrom = fromInput.dateText
  const orderTo = toInput.dateText
  const start = fromInput.hasExplicitTime
    ? fromInput.date
    : startOfUtcDate(orderFrom)
  const end = toInput.hasExplicitTime
    ? toInput.date
    : endOfUtcDate(orderTo)
  const businessStart = fromInput.hasExplicitTime
    ? fromInput.date
    : startOfBusinessDate(orderFrom)
  const businessEnd = toInput.hasExplicitTime
    ? toInput.date
    : endOfBusinessDate(orderTo)
  const days = inclusiveDays(orderFrom, orderTo)
  if (start.getTime() > end.getTime() || days <= 0) {
    fail("INVALID_DATE_RANGE", "orderFrom must be before or equal to orderTo.")
  }
  if (days > MAX_RANGE_DAYS) {
    fail(
      "INVALID_DATE_RANGE",
      `Date range must not exceed ${MAX_RANGE_DAYS} days.`
    )
  }
  return {
    orderFrom,
    orderTo,
    start,
    end,
    businessStart,
    businessEnd,
    days
  }
}

export function inclusiveDays(fromText: string, toText: string): number {
  const [fy, fm, fd] = fromText.split("-").map(Number)
  const [ty, tm, td] = toText.split("-").map(Number)
  const fromUtc = Date.UTC(fy, fm - 1, fd)
  const toUtc = Date.UTC(ty, tm - 1, td)
  return Math.floor((toUtc - fromUtc) / 86400000) + 1
}

export function addDays(dateText: string, days: number): string {
  const [y, m, d] = dateText.split("-").map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  date.setUTCDate(date.getUTCDate() + days)
  const yyyy = date.getUTCFullYear()
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(date.getUTCDate()).padStart(2, "0")
  return `${yyyy}-${mm}-${dd}`
}

export function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0)
    return 0
  return numerator / denominator
}

export function round(value: number, digits = 2): number {
  const p = Math.pow(10, digits)
  return Math.round((value + Number.EPSILON) * p) / p
}

export function expectedMonthlyProgress(month: number, year: number): number {
  const now = new Date()
  const currentYear = Number(formatInTimeZone(now, SHOPEE_TZ, "yyyy"))
  const currentMonth = Number(formatInTimeZone(now, SHOPEE_TZ, "MM"))
  const currentDay = Number(formatInTimeZone(now, SHOPEE_TZ, "dd"))
  const totalDays = new Date(year, month, 0).getDate()

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return 100
  }
  if (year > currentYear || (year === currentYear && month > currentMonth)) {
    return 0
  }
  return round(safeDivide(currentDay * 100, totalDays), 2)
}

export function toProgress(actual: number, target: number): number {
  return round(safeDivide(actual * 100, target), 2)
}

export function toSpeed(actualProgress: number, expectedProgress: number): number {
  return round(safeDivide(actualProgress, expectedProgress), 4)
}

export function toKpiStatus(
  target: number,
  deltaPercent: number
): "ahead" | "behind" | "on_track" | "no_target" {
  if (target <= 0) return "no_target"
  if (Math.abs(deltaPercent) < 0.01) return "on_track"
  return deltaPercent > 0 ? "ahead" : "behind"
}

export function isPartialToday(toDateText: string): boolean {
  const today = formatInTimeZone(new Date(), SHOPEE_TZ, "yyyy-MM-dd")
  return toDateText >= today
}
