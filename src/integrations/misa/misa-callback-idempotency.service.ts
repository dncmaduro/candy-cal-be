import { Injectable } from "@nestjs/common"

/**
 * Process-local protection for the current no-side-effect callback handler.
 *
 * TODO: replace with a persistent store with a unique key when a MISA result
 * updates an order or voucher. Use request_id, org_refid, or MISA's operation
 * identifier as the uniqueness key so retries remain safe across restarts.
 */
@Injectable()
export class MisaCallbackIdempotencyService {
  private readonly processed = new Map<string, number>()
  private readonly ttlMs = 24 * 60 * 60 * 1000

  claim(key: string): boolean {
    this.removeExpiredEntries()
    if (this.processed.has(key)) return false

    this.processed.set(key, Date.now())
    return true
  }

  release(key: string): void {
    this.processed.delete(key)
  }

  private removeExpiredEntries(): void {
    const cutoff = Date.now() - this.ttlMs
    for (const [key, createdAt] of this.processed.entries()) {
      if (createdAt < cutoff) this.processed.delete(key)
    }
  }
}
