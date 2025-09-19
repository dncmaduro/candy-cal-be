import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import * as bodyParser from "body-parser"

async function bootstrap() {
  console.log("🚀 Starting NestJS application...")
  const app = await NestFactory.create(AppModule)
  const { PORT } = process.env
  app.setGlobalPrefix("api/v1")
  app.enableCors()
  app.use(bodyParser.json())
  try {
    await app.listen(PORT, () => {
      console.log(`✅ Server ready and listening on PORT ${PORT}`)
      console.log(`📡 API endpoints discovery running in background...`)
    })
  } catch (error) {
    console.log("❌ Failed to start server:", error)
  }
}
bootstrap()
