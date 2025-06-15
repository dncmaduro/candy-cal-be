import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { StorageItemsController } from "./storageitems.controller"
import { StorageItemsService } from "./storageitems.service"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "storageitems", schema: StorageItemSchema }
    ]) // Register the User schema
  ],
  controllers: [StorageItemsController],
  providers: [StorageItemsService],
  exports: [StorageItemsService] // Export UsersService if needed elsewhere
})
export class StorageItemsModule {}
