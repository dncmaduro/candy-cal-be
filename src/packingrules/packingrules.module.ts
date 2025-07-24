import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { PackingRuleSchema } from "../database/mongoose/schemas/PackingRule"
import { PackingRulesController } from "./packingrules.controller"
import { PackingRulesService } from "./packingrules.service"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "packingrules", schema: PackingRuleSchema }
    ])
  ],
  controllers: [PackingRulesController],
  providers: [PackingRulesService],
  exports: [PackingRulesService]
})
export class PackingRulesModule {}
