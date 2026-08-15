import { NestFactory } from "@nestjs/core"
import { ModulesContainer } from "@nestjs/core/injector/modules-container"
import { GUARDS_METADATA } from "@nestjs/common/constants"
import { ApiBearerAuth, DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { AppModule } from "./app.module"
import * as bodyParser from "body-parser"
import { JwtAuthGuard } from "./auth/jwt-auth.guard"
import { getCorsOptions } from "./common/cors-policy"

const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head"
]

function addSwaggerSecurityFromGuards(app: any): void {
  const modules = app.get(ModulesContainer)

  for (const module of modules.values()) {
    for (const controller of module.controllers.values()) {
      const controllerClass = controller.metatype
      if (!controllerClass) continue

      const hasClassJwtGuard = (
        Reflect.getMetadata(GUARDS_METADATA, controllerClass) || []
      ).includes(JwtAuthGuard)
      if (hasClassJwtGuard) {
        ApiBearerAuth("bearer")(controllerClass)
      }

      const prototype = controllerClass.prototype
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === "constructor") continue
        const guards =
          Reflect.getMetadata(GUARDS_METADATA, prototype, methodName) || []
        if (hasClassJwtGuard || guards.includes(JwtAuthGuard)) {
          ApiBearerAuth("bearer")(
            prototype,
            methodName,
            Object.getOwnPropertyDescriptor(prototype, methodName)!
          )
        }
      }
    }
  }
}

function addSwaggerStandardResponses(swaggerDocument: any): void {
  swaggerDocument.components ??= {}
  swaggerDocument.components.schemas ??= {}
  swaggerDocument.components.schemas.ApiError = {
    type: "object",
    properties: {
      statusCode: { type: "number", example: 400 },
      message: {
        oneOf: [
          { type: "string" },
          { type: "array", items: { type: "string" } }
        ]
      },
      error: { type: "string", example: "Bad Request" }
    }
  }

  for (const [path, pathItem] of Object.entries(swaggerDocument.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = (pathItem as any)[method]
      if (!operation) continue

      operation.summary ??= `${method.toUpperCase()} ${path}`
      operation.responses ??= {}
      operation.responses["400"] ??= {
        description: "Request không hợp lệ",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" }
          }
        }
      }
      operation.responses["500"] ??= {
        description: "Lỗi máy chủ",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ApiError" }
          }
        }
      }

      if (operation.security?.length) {
        operation.responses["401"] ??= {
          description: "Thiếu hoặc không hợp lệ JWT Bearer token",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" }
            }
          }
        }
        operation.responses["403"] ??= {
          description: "Không có quyền thực hiện thao tác",
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/ApiError" }
            }
          }
        }
      }
    }
  }
}

async function bootstrap() {
  console.log("🚀 Starting NestJS application...")
  const app = await NestFactory.create(AppModule)
  const { PORT } = process.env
  app.setGlobalPrefix("api/v1")
  app.enableCors(getCorsOptions())
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
    .build()

  // Security is added per route from JwtAuthGuard. Public endpoints such as
  // login therefore remain executable in Swagger without a token.
  addSwaggerSecurityFromGuards(app)
  const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig, {
    // Scan every imported module so all REST controllers are documented.
    deepScanRoutes: true,
    // Controllers without explicit @ApiTags are grouped automatically by name.
    autoTagControllers: true,
    operationIdFactory: (controllerKey, methodKey) =>
      `${controllerKey}_${methodKey}`
  })
  addSwaggerStandardResponses(swaggerDocument)

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
