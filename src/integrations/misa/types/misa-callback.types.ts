import { MisaCallbackDto, MisaRawCallbackPayload } from "../dto/misa-callback.dto"

export const MISA_CALLBACK_DATA_TYPE = {
  SAVE_VOUCHER: 1,
  DELETE_VOUCHER: 2,
  UPDATE_DOCUMENT_REFERENCE: 4,
  UPDATE_TAX_INFO: 5
} as const

export type MisaParsedCallbackData = Record<string, unknown> | unknown[] | null

export interface MisaCallbackContext {
  callback: MisaCallbackDto
  rawPayload: MisaRawCallbackPayload
  rawData: string | Record<string, unknown> | unknown[]
  parsedData: MisaParsedCallbackData
  dataParseError?: string
  identifier?: string
}

export interface MisaCallbackHandlingResult {
  duplicate: boolean
  handler: "save_voucher" | "unknown"
  identifier?: string
}
