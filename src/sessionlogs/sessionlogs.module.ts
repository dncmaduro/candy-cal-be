import { Module } from "@nestjs/common"
import { SessionLogsController } from "./sessionlogs.controller"
import { MongooseModule } from "@nestjs/mongoose"
import { SessionLogsService } from "./sessionlogs.service"
import { SessionLogSchema } from "../database/mongoose/schemas/SessionLog"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "sessionlogs", schema: SessionLogSchema }
    ])
  ],
  controllers: [SessionLogsController],
  providers: [SessionLogsService],
  exports: [SessionLogsService]
})
export class SessionLogsModule {}
