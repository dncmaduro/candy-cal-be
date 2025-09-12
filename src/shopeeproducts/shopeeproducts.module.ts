import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ShopeeProductSchema } from "../database/mongoose/schemas/ShopeeProduct"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"
import { ShopeeProductsController } from "./shopeeproducts.controller"
import { ShopeeService } from "./shopeeproducts.service"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "shopeeproducts", schema: ShopeeProductSchema },
      { name: "storageitems", schema: StorageItemSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [ShopeeProductsController],
  providers: [ShopeeService],
  exports: [ShopeeService]
})
export class ShopeeProductsModule {}
