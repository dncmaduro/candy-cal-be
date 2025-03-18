import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ProductSchema } from "src/database/mongoose/schemas/Product"
import { ProductsController } from "./products.controller"
import { ProductsService } from "./products.service"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "products", schema: ProductSchema }]) // Register the Product schema
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService] // Export ProductsService if needed elsewhere
})
export class ProductsModule {}
