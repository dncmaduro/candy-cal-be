import { NestFactory } from "@nestjs/core"
import { AppModule } from "./app.module"
import * as bodyParser from "body-parser"
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger"

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const { PORT } = process.env
  app.setGlobalPrefix("api/v1")
  app.enableCors()
  console.log(process.env.DATABASE_URL)
  app.use(bodyParser.json())
  const config = new DocumentBuilder()
    .setTitle("Cats example")
    .setDescription("The cats API description")
    .setVersion("1.0")
    .addTag("cats")
    .build()
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup("api", app, document)
  try {
    await app.listen(PORT, () =>
      console.log(`Server listening on PORT ${PORT}`)
    )
  } catch (error) {
    console.log(error)
  }
}
bootstrap()
