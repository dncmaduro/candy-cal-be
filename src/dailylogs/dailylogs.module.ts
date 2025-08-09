import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { DailyLogSchema } from "../database/mongoose/schemas/DailyLog"
import { DailyLogsController } from "./dailylogs.controller"
import { DailyLogsService } from "./dailylogs.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "dailylogs", schema: DailyLogSchema }]),
    SystemLogsModule
  ],
  controllers: [DailyLogsController],
  providers: [DailyLogsService],
  exports: [DailyLogsService]
})
export class DailyLogsModule {}
