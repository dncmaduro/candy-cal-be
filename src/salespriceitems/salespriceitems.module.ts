import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesPriceItemSchema } from "../database/mongoose/schemas/SalesPriceItem"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"
import { SalesPriceItemsService } from "./salespriceitems.service"
import { SalesPriceItemsController } from "./salespriceitems.controller"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salespriceitems", schema: SalesPriceItemSchema },
      { name: "storageitems", schema: StorageItemSchema }
    ])
  ],
  providers: [SalesPriceItemsService],
  controllers: [SalesPriceItemsController],
  exports: [SalesPriceItemsService]
})
export class SalesPriceItemsModule {}
