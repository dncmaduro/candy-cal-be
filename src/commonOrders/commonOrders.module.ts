import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ItemSchema } from "src/database/mongoose/schemas/Item"
import { CommonOrdersController } from "./commonOrders.controller"
import { CommonOrdersService } from "./commonOrders.service"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "commonOrders", schema: ItemSchema }]) // Register the User schema
  ],
  controllers: [CommonOrdersController],
  providers: [CommonOrdersService],
  exports: [CommonOrdersService] // Export UsersService if needed elsewhere
})
export class ItemsModule {}
