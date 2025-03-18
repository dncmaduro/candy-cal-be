import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ItemSchema } from "src/database/mongoose/schemas/Item"
import { ItemsController } from "./items.controller"
import { ItemsService } from "./items.service"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "items", schema: ItemSchema }]) // Register the User schema
  ],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService] // Export UsersService if needed elsewhere
})
export class ItemsModule {}
