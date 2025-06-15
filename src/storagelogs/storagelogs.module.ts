import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { StorageLogSchema } from "../database/mongoose/schemas/StorageLog"
import { StorageLogsController } from "./storagelogs.controller"
import { StorageLogsService } from "./storagelogs.service"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "storagelogs", schema: StorageLogSchema },
      { name: "storageitems", schema: StorageItemSchema }
    ])
  ],
  controllers: [StorageLogsController],
  providers: [StorageLogsService],
  exports: [StorageLogsService]
})
export class StorageLogsModule {}
