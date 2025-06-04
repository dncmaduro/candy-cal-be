import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LogSchema } from "src/database/mongoose/schemas/Log"
import { LogsController } from "./logs.controller"
import { LogsService } from "./logs.service"

@Module({
  imports: [MongooseModule.forFeature([{ name: "logs", schema: LogSchema }])],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService]
})
export class LogsModule {}
