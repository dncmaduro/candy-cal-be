export class SystemLogsDto {
  // existing minimal fields
  type: string
  action: string

  // optional structured fields (enhancement)
  entity?: string
  entityId?: string
  result?: "success" | "failed"
  meta?: Record<string, any>

  // captured from request context when available
  ip?: string
  userAgent?: string
}
