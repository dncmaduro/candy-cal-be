import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamController } from "./livestream.controller"
import { LivestreamService } from "./livestream.service"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"
import { LivestreamPeriodSchema } from "../database/mongoose/schemas/LivestreamPeriod"
import { LivestreamEmployeeSchema } from "../database/mongoose/schemas/LivestreamEmployee"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "livestreams", schema: LivestreamSchema },
      { name: "livestreamperiods", schema: LivestreamPeriodSchema },
      { name: "livestreamemployees", schema: LivestreamEmployeeSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [LivestreamController],
  providers: [LivestreamService],
  exports: [LivestreamService]
})
export class LivestreamModule {}
