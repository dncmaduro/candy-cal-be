import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamperformanceService } from "./livestreamperformance.service"
import { LivestreamperformanceController } from "./livestreamperformance.controller"
import { LivestreamPerformanceSchema } from "../database/mongoose/schemas/LivestreamPerformance"
import { LivestreamSchema } from "../database/mongoose/schemas/Livestream"
import { UserSchema } from "../database/mongoose/schemas/User"
import { LivestreamSalarySchema } from "../database/mongoose/schemas/LivestreamSalary"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "LivestreamPerformance", schema: LivestreamPerformanceSchema },
      { name: "livestreams", schema: LivestreamSchema },
      { name: "users", schema: UserSchema },
      { name: "LivestreamSalary", schema: LivestreamSalarySchema }
    ])
  ],
  controllers: [LivestreamperformanceController],
  providers: [LivestreamperformanceService],
  exports: [LivestreamperformanceService]
})
export class LivestreamperformanceModule {}
