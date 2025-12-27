import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamaltrequestsController } from "./livestreamaltrequests.controller"
import { LivestreamaltrequestsService } from "./livestreamaltrequests.service"
import { LivestreamAltRequestSchema } from "../database/mongoose/schemas/LivestreamAltRequest"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreamaltrequest", schema: LivestreamAltRequestSchema },
      { name: "livestreams", schema: LivestreamSchema },
      { name: "users", schema: UserSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreamaltrequestsController],
  providers: [LivestreamaltrequestsService],
  exports: [LivestreamaltrequestsService]
})
export class LivestreamaltrequestsModule {}
