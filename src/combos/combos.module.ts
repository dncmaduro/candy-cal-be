import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { CombosController } from "./combos.controller"
import { CombosService } from "./combos.service"
import { ComboSchema } from "src/database/mongoose/schemas/Combo"
import { ProductModel } from "src/database/mongoose/schemas/Product"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "combos", schema: ComboSchema },
      { name: "products", schema: ProductModel }
    ]) // Register the Product schema
  ],
  controllers: [CombosController],
  providers: [CombosService],
  exports: [CombosService] // Export ProductsService if needed elsewhere
})
export class CombosModule {}
