import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ProductSchema } from "../database/mongoose/schemas/Product"
import { ProductsController } from "./products.controller"
import { ProductsService } from "./products.service"
import { ItemSchema } from "../database/mongoose/schemas/Item"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "products", schema: ProductSchema },
      { name: "items", schema: ItemSchema },
      { name: "storageitems", schema: StorageItemSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService]
})
export class ProductsModule {}
