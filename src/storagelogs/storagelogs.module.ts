import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { StorageLogSchema } from "../database/mongoose/schemas/StorageLog"
import { StorageLogsController } from "./storagelogs.controller"
import { StorageLogsService } from "./storagelogs.service"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "storagelogs", schema: StorageLogSchema },
      { name: "storageitems", schema: StorageItemSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [StorageLogsController],
  providers: [StorageLogsService],
  exports: [StorageLogsService]
})
export class StorageLogsModule {}
