import { BadRequestException } from "@nestjs/common"

export type MisaRawCallbackPayload = Record<string, unknown>

export interface MisaCallbackDto {
  success: boolean
  error_code?: string
  error_message?: string
  signature?: string
  data_type: number
  org_company_code: string
  data: string | Record<string, unknown> | unknown[]
  app_id?: string
  request_id?: string
  rawPayload: MisaRawCallbackPayload
}

function stringValue(
  rawPayload: MisaRawCallbackPayload,
  snakeCase: string,
  camelCase: string
): unknown {
  return rawPayload[snakeCase] ?? rawPayload[camelCase]
}

function optionalString(
  value: unknown,
  fieldName: string
): string | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value !== "string") {
    throw new BadRequestException(`${fieldName} must be a string`)
  }
  return value
}

/**
 * MISA documents snake_case fields. Camel-case aliases are accepted only at
 * the boundary to make the receiver tolerant of transport/client variations.
 */
export function parseMisaCallbackDto(input: unknown): MisaCallbackDto {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new BadRequestException("MISA callback body must be a JSON object")
  }

  const rawPayload = input as MisaRawCallbackPayload
  const success = rawPayload.success
  const dataType = stringValue(rawPayload, "data_type", "dataType")
  const orgCompanyCode = stringValue(
    rawPayload,
    "org_company_code",
    "orgCompanyCode"
  )
  const data = rawPayload.data

  if (typeof success !== "boolean") {
    throw new BadRequestException("success must be a boolean")
  }
  if (!Number.isInteger(dataType)) {
    throw new BadRequestException("data_type must be an integer")
  }
  if (typeof orgCompanyCode !== "string" || !orgCompanyCode.trim()) {
    throw new BadRequestException("org_company_code must be a non-empty string")
  }
  if (typeof data !== "string" && (!data || typeof data !== "object")) {
    throw new BadRequestException("data must be a JSON string, object, or array")
  }

  const signature = optionalString(rawPayload.signature, "signature")
  if (signature !== undefined && !signature.trim()) {
    throw new BadRequestException("signature must not be empty when provided")
  }

  return {
    success,
    error_code: optionalString(
      stringValue(rawPayload, "error_code", "errorCode"),
      "error_code"
    ),
    error_message: optionalString(
      stringValue(rawPayload, "error_message", "errorMessage"),
      "error_message"
    ),
    signature,
    data_type: dataType as number,
    org_company_code: orgCompanyCode,
    data: data as string | Record<string, unknown> | unknown[],
    app_id: optionalString(stringValue(rawPayload, "app_id", "appId"), "app_id"),
    request_id: optionalString(
      stringValue(rawPayload, "request_id", "requestId"),
      "request_id"
    ),
    rawPayload
  }
}
