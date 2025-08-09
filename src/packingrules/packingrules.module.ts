import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { PackingRuleSchema } from "../database/mongoose/schemas/PackingRule"
import { PackingRulesController } from "./packingrules.controller"
import { PackingRulesService } from "./packingrules.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "packingrules", schema: PackingRuleSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [PackingRulesController],
  providers: [PackingRulesService],
  exports: [PackingRulesService]
})
export class PackingRulesModule {}
