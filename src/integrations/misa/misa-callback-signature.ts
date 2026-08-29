import { createHmac, timingSafeEqual } from "crypto"

export interface MisaSignatureVerification {
  valid: boolean
  enforced: boolean
  reason?: string
}

/**
 * Verifies the documented MISA AMIS Accounting callback signature:
 * HMAC-SHA256(raw `data`, key = registered app_id).
 *
 * `data` must remain the original string. Re-serializing an object would make
 * a signature check dependent on an invented JSON canonicalization scheme.
 */
export function verifyMisaCallbackSignature(input: {
  data: unknown
  signature?: string
  configuredAppId?: string
  callbackAppId?: string
}): MisaSignatureVerification {
  const configuredAppId = input.configuredAppId?.trim()
  if (!configuredAppId) {
    return {
      valid: true,
      enforced: false,
      reason: "MISA_APP_ID is not configured"
    }
  }

  if (!input.signature?.trim()) {
    return {
      valid: false,
      enforced: true,
      reason: "MISA callback signature is missing"
    }
  }
  if (input.callbackAppId && input.callbackAppId !== configuredAppId) {
    return {
      valid: false,
      enforced: true,
      reason: "MISA callback app_id does not match configured app_id"
    }
  }
  if (typeof input.data !== "string") {
    return {
      valid: false,
      enforced: true,
      reason: "MISA signature can only be verified against raw string data"
    }
  }

  const expected = createHmac("sha256", configuredAppId)
    .update(input.data, "utf8")
    .digest("hex")
  const received = input.signature.trim().toLowerCase()
  const expectedBuffer = Buffer.from(expected, "utf8")
  const receivedBuffer = Buffer.from(received, "utf8")

  return {
    valid:
      expectedBuffer.length === receivedBuffer.length &&
      timingSafeEqual(expectedBuffer, receivedBuffer),
    enforced: true,
    reason: "MISA callback signature does not match"
  }
}
