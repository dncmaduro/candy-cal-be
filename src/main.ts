import { NestFactory } from "@nestjs/core"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "./app.module"
import * as bodyParser from "body-parser"

async function bootstrap() {
  console.log("🚀 Starting NestJS application...")
  const app = await NestFactory.create(AppModule)
  const { PORT } = process.env
  app.setGlobalPrefix("api/v1")
  app.enableCors()
  app.use(bodyParser.json())

  const swaggerConfig = new DocumentBuilder()
    .setTitle("Candy Cal API")
    .setDescription(
      "Tài liệu REST API cho hệ thống Candy Cal. Các endpoint đã bao gồm tiền tố /api/v1."
    )
    .setVersion("1.0")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Nhập access token JWT (không cần tiền tố Bearer)."
      },
      "bearer"
    )
    .addSecurityRequirements("bearer")
    .build()

  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    // Scan every imported module so all REST controllers are documented.
    deepScanRoutes: true,
    // Controllers without explicit @ApiTags are grouped automatically by name.
    autoTagControllers: true,
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`
  })

  SwaggerModule.setup("docs", app, swaggerDocument, {
    // Keep Swagger under the same /api/v1 prefix as the REST API.
    useGlobalPrefix: true,
    jsonDocumentUrl: "docs/openapi.json",
    yamlDocumentUrl: "docs/openapi.yaml",
    customSiteTitle: "Candy Cal API Docs"
  })

  try {
    await app.listen(PORT, () => {
      console.log(`✅ Server ready and listening on PORT ${PORT}`)
      console.log(`📡 API endpoints discovery running in background...`)
      console.log("📚 Swagger UI available at /api/v1/docs")
    })
  } catch (error) {
    console.log("❌ Failed to start server:", error)
  }
}
bootstrap()
