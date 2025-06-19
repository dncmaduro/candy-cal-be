import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ProductSchema } from "../database/mongoose/schemas/Product"
import { ProductsController } from "./products.controller"
import { ProductsService } from "./products.service"
import { ItemSchema } from "../database/mongoose/schemas/Item"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "products", schema: ProductSchema },
      { name: "items", schema: ItemSchema },
      { name: "storageitems", schema: StorageItemSchema } // Assuming StorageItem uses the same schema as Item
    ]) // Register the Product schema
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService] // Export ProductsService if needed elsewhere
})
export class ProductsModule {}
