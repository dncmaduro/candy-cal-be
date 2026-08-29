const assert = require("node:assert/strict")
const { createHmac } = require("node:crypto")
const { RequestMethod } = require("@nestjs/common")
const { NestFactory } = require("@nestjs/core")
const { parseMisaCallbackDto } = require("../dist/integrations/misa/dto/misa-callback.dto")
const { MisaCallbackService } = require("../dist/integrations/misa/misa-callback.service")
const { MisaCallbackIdempotencyService } = require("../dist/integrations/misa/misa-callback-idempotency.service")
const { MisaModule } = require("../dist/integrations/misa/misa.module")

function payload(overrides = {}) {
  return {
    success: true,
    error_code: "",
    error_message: "",
    data_type: 1,
    org_company_code: "test-company",
    data: '[{"org_refid":"order-123","success":true}]',
    ...overrides
  }
}

async function main() {
  const service = new MisaCallbackService(new MisaCallbackIdempotencyService())

  delete process.env.MISA_APP_ID
  let result = await service.handleCallback(parseMisaCallbackDto(payload()))
  assert.equal(result.duplicate, false)
  result = await service.handleCallback(parseMisaCallbackDto(payload()))
  assert.equal(result.duplicate, true)

  const parsed = parseMisaCallbackDto(payload({ data: '{"org_refid":"order-456"}' }))
  const parsedResult = await new MisaCallbackService(
    new MisaCallbackIdempotencyService()
  ).handleCallback(parsed)
  assert.equal(parsedResult.identifier, "order-456")

  const malformedResult = await new MisaCallbackService(
    new MisaCallbackIdempotencyService()
  ).handleCallback(parseMisaCallbackDto(payload({ data: "not json" })))
  assert.equal(malformedResult.handler, "save_voucher")

  const unknownResult = await new MisaCallbackService(
    new MisaCallbackIdempotencyService()
  ).handleCallback(parseMisaCallbackDto(payload({ data_type: 999 })))
  assert.equal(unknownResult.handler, "unknown")

  assert.throws(() => parseMisaCallbackDto({ success: "yes" }))

  process.env.MISA_APP_ID = "misa-app-id"
  await assert.rejects(
    () =>
      new MisaCallbackService(new MisaCallbackIdempotencyService()).handleCallback(
        parseMisaCallbackDto(payload({ signature: "invalid" }))
      ),
    { status: 401 }
  )

  const signed = payload()
  signed.signature = createHmac("sha256", process.env.MISA_APP_ID)
    .update(signed.data, "utf8")
    .digest("hex")
  const signedResult = await new MisaCallbackService(
    new MisaCallbackIdempotencyService()
  ).handleCallback(parseMisaCallbackDto(signed))
  assert.equal(signedResult.duplicate, false)

  const app = await NestFactory.create(MisaModule, { logger: false })
  app.setGlobalPrefix("api/v1", {
    exclude: [
      { path: "api/integrations/misa/callback", method: RequestMethod.POST }
    ]
  })
  await app.listen(0, "127.0.0.1")
  try {
    const address = app.getHttpServer().address()
    const url = `http://127.0.0.1:${address.port}/api/integrations/misa/callback`
    const httpPayload = payload()
    httpPayload.signature = createHmac("sha256", process.env.MISA_APP_ID)
      .update(httpPayload.data, "utf8")
      .digest("hex")

    const accepted = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(httpPayload)
    })
    assert.equal(accepted.status, 200)
    assert.deepEqual(await accepted.json(), { success: true })

    const invalid = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ success: "invalid" })
    })
    assert.equal(invalid.status, 400)

    const versionedPath = await fetch(
      `http://127.0.0.1:${address.port}/api/v1/api/integrations/misa/callback`,
      { method: "POST" }
    )
    assert.equal(versionedPath.status, 404)
  } finally {
    await app.close()
  }

  console.log("MISA callback checks passed")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
