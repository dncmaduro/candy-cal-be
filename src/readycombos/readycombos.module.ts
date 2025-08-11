import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ReadyComboSchema } from "../database/mongoose/schemas/ReadyCombo"
import { ReadyCombosController } from "./readycombos.controller"
import { ReadyCombosService } from "./readycombos.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "readycombos", schema: ReadyComboSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [ReadyCombosController],
  providers: [ReadyCombosService],
  exports: [ReadyCombosService]
})
export class ReadyCombosModule {}
