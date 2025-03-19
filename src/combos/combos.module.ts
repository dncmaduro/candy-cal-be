import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { CombosController } from "./combos.controller"
import { CombosService } from "./combos.service"
import { ComboSchema } from "src/database/mongoose/schemas/Combo"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "combos", schema: ComboSchema }]) // Register the Product schema
  ],
  controllers: [CombosController],
  providers: [CombosService],
  exports: [CombosService] // Export ProductsService if needed elsewhere
})
export class CombosModule {}
