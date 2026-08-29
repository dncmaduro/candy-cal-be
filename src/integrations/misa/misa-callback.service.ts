import { Injectable, Logger, UnauthorizedException } from "@nestjs/common"
import { createHash } from "crypto"
import { MisaCallbackDto } from "./dto/misa-callback.dto"
import { MisaCallbackIdempotencyService } from "./misa-callback-idempotency.service"
import { verifyMisaCallbackSignature } from "./misa-callback-signature"
import {
  MISA_CALLBACK_DATA_TYPE,
  MisaCallbackContext,
  MisaCallbackHandlingResult,
  MisaParsedCallbackData
} from "./types/misa-callback.types"

@Injectable()
export class MisaCallbackService {
  private readonly logger = new Logger(MisaCallbackService.name)

  constructor(
    private readonly idempotencyService: MisaCallbackIdempotencyService
  ) {}

  async handleCallback(
    callback: MisaCallbackDto
  ): Promise<MisaCallbackHandlingResult> {
    const context = this.createContext(callback)
    const signature = verifyMisaCallbackSignature({
      data: callback.data,
      signature: callback.signature,
      configuredAppId: process.env.MISA_APP_ID,
      callbackAppId: callback.app_id
    })

    if (!signature.valid) {
      this.log("warn", "signature_rejected", context, { reason: signature.reason })
      throw new UnauthorizedException("Invalid MISA callback signature")
    }
    if (!signature.enforced) {
      this.log("warn", "signature_not_enforced", context, {
        reason: signature.reason
      })
    }
    if (context.dataParseError) {
      this.log("warn", "data_parse_failed", context, {
        reason: context.dataParseError
      })
    }

    const idempotencyKey = this.createIdempotencyKey(context)
    if (!this.idempotencyService.claim(idempotencyKey)) {
      this.log("log", "duplicate_ignored", context)
      return { duplicate: true, handler: this.handlerName(callback), identifier: context.identifier }
    }

    try {
      const result = await this.dispatch(context)
      this.log("log", "received", context, {
        handler: result.handler,
        duplicate: false
      })
      return result
    } catch (error) {
      this.idempotencyService.release(idempotencyKey)
      const stack = error instanceof Error ? error.stack : undefined
      this.log("error", "processing_failed", context, {
        message: error instanceof Error ? error.message : "Unknown error"
      }, stack)
      throw error
    }
  }

  private createContext(callback: MisaCallbackDto): MisaCallbackContext {
    const { parsedData, dataParseError } = this.parseData(callback.data)
    return {
      callback,
      rawPayload: callback.rawPayload,
      rawData: callback.data,
      parsedData,
      dataParseError,
      identifier: this.findIdentifier(callback, parsedData)
    }
  }

  private parseData(data: MisaCallbackDto["data"]): {
    parsedData: MisaParsedCallbackData
    dataParseError?: string
  } {
    if (typeof data !== "string") return { parsedData: data }

    try {
      const parsed = JSON.parse(data)
      if (!parsed || typeof parsed !== "object") {
        return {
          parsedData: null,
          dataParseError: "JSON data must decode to an object or array"
        }
      }
      return { parsedData: parsed as MisaParsedCallbackData }
    } catch (error) {
      return {
        parsedData: null,
        dataParseError:
          error instanceof Error ? error.message : "Unable to parse MISA data"
      }
    }
  }

  private async dispatch(
    context: MisaCallbackContext
  ): Promise<MisaCallbackHandlingResult> {
    if (context.callback.data_type === MISA_CALLBACK_DATA_TYPE.SAVE_VOUCHER) {
      await this.handleSaveResult(context)
      return {
        duplicate: false,
        handler: "save_voucher",
        identifier: context.identifier
      }
    }

    this.log("warn", "unknown_data_type", context)
    return {
      duplicate: false,
      handler: "unknown",
      identifier: context.identifier
    }
  }

  private async handleSaveResult(context: MisaCallbackContext): Promise<void> {
    // TODO: when outbound MISA saves are added, update the matching local
    // record transactionally using request_id/org_refid. Do not add a second
    // side effect until that persistent idempotency key exists.
    void context
  }

  private findIdentifier(
    callback: MisaCallbackDto,
    parsedData: MisaParsedCallbackData
  ): string | undefined {
    if (callback.request_id) return callback.request_id
    const candidates = Array.isArray(parsedData) ? parsedData : [parsedData]
    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue
      const record = candidate as Record<string, unknown>
      for (const key of ["org_refid", "request_id", "transaction_id", "id"]) {
        if (typeof record[key] === "string" && record[key].trim()) {
          return record[key] as string
        }
      }
    }
    return undefined
  }

  private createIdempotencyKey(context: MisaCallbackContext): string {
    const data =
      typeof context.rawData === "string"
        ? context.rawData
        : JSON.stringify(context.rawData)
    const stableIdentifier = context.identifier || createHash("sha256").update(data).digest("hex")
    return [
      context.callback.org_company_code,
      context.callback.data_type,
      context.callback.success,
      context.callback.error_code || "",
      stableIdentifier
    ].join(":")
  }

  private handlerName(callback: MisaCallbackDto): "save_voucher" | "unknown" {
    return callback.data_type === MISA_CALLBACK_DATA_TYPE.SAVE_VOUCHER
      ? "save_voucher"
      : "unknown"
  }

  private log(
    level: "log" | "warn" | "error",
    event: string,
    context: MisaCallbackContext,
    extra: Record<string, unknown> = {},
    stack?: string
  ): void {
    const message = JSON.stringify({
      timestamp: new Date().toISOString(),
      integration: "misa",
      event,
      org_company_code: context.callback.org_company_code,
      data_type: context.callback.data_type,
      success: context.callback.success,
      error_code: context.callback.error_code,
      identifier: context.identifier,
      ...extra
    })
    if (level === "error") this.logger.error(message, stack)
    else this.logger[level](message)
  }
}
