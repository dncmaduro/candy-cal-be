import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { StorageLogSchema } from "../database/mongoose/schemas/StorageLog"
import { StorageLogsController } from "./storagelogs.controller"
import { StorageLogsService } from "./storagelogs.service"
import { ItemSchema } from "../database/mongoose/schemas/Item"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "storagelogs", schema: StorageLogSchema },
      { name: "items", schema: ItemSchema }
    ])
  ],
  controllers: [StorageLogsController],
  providers: [StorageLogsService],
  exports: [StorageLogsService]
})
export class StorageLogsModule {}
