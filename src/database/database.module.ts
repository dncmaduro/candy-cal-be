import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { UserSchema } from "./mongoose/schemas/User"
import { ProductSchema } from "./mongoose/schemas/Product"
import { ItemSchema } from "./mongoose/schemas/Item"
import { CommonOrderSchema } from "./mongoose/schemas/CommonOrder"
import { LogSchema } from "./mongoose/schemas/Log"
import { StorageItemSchema } from "./mongoose/schemas/StorageItem"
import { StorageLogSchema } from "./mongoose/schemas/StorageLog"
import { DeliveredRequestSchema } from "./mongoose/schemas/DeliveredRequest"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "users", schema: UserSchema },
      { name: "products", schema: ProductSchema },
      { name: "items", schema: ItemSchema },
      { name: "commonorders", schema: CommonOrderSchema },
      { name: "logs", schema: LogSchema },
      { name: "storageitems", schema: StorageItemSchema },
      { name: "storagelogs", schema: StorageLogSchema },
      { name: "deliveredrequests", schema: DeliveredRequestSchema }
    ])
  ],
  exports: [MongooseModule] // Export MongooseModule for use in other modules
})
export class DatabaseModule {}
