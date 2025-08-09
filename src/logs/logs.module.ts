import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LogSchema } from "../database/mongoose/schemas/Log"
import { LogsController } from "./logs.controller"
import { LogsService } from "./logs.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "logs", schema: LogSchema }]),
    SystemLogsModule
  ],
  controllers: [LogsController],
  providers: [LogsService],
  exports: [LogsService]
})
export class LogsModule {}
