import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { LivestreamsalaryService } from "./livestreamsalary.service"
import { LivestreamsalaryController } from "./livestreamsalary.controller"
import { LivestreamSalarySchema } from "../database/mongoose/schemas/LivestreamSalary"
import { LivestreamPerformanceSchema } from "../database/mongoose/schemas/LivestreamPerformance"
import { UserSchema } from "../database/mongoose/schemas/User"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "LivestreamSalary", schema: LivestreamSalarySchema },
      { name: "LivestreamPerformance", schema: LivestreamPerformanceSchema },
      { name: "users", schema: UserSchema }
    ])
  ],
  controllers: [LivestreamsalaryController],
  providers: [LivestreamsalaryService],
  exports: [LivestreamsalaryService]
})
export class LivestreamsalaryModule {}
