import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { StorageItemsController } from "./storageitems.controller"
import { StorageItemsService } from "./storageitems.service"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "storageitems", schema: StorageItemSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [StorageItemsController],
  providers: [StorageItemsService],
  exports: [StorageItemsService]
})
export class StorageItemsModule {}
