import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SystemLogSchema } from "../database/mongoose/schemas/SystemLog"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SystemLogsController } from "./systemlogs.controller"
import { SystemLogsService } from "./systemlogs.service"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "SystemLog", schema: SystemLogSchema }]),
    MongooseModule.forFeature([{ name: "users", schema: UserSchema }])
  ],
  controllers: [SystemLogsController],
  providers: [SystemLogsService],
  exports: [SystemLogsService]
})
export class SystemLogsModule {}
