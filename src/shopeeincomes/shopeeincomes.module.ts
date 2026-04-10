import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ShopeeIncomesService } from "./shopeeincomes.service"
import { ShopeeIncomesController } from "./shopeeincomes.controller"
import { ShopeeIncomeSchema } from "../database/mongoose/schemas/ShopeeIncome"
import { ShopeeChannelSchema } from "../database/mongoose/schemas/ShopeeChannel"
import { ShopeeProductSchema } from "../database/mongoose/schemas/ShopeeProduct"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "shopeeincomes", schema: ShopeeIncomeSchema },
      { name: "shopeechannels", schema: ShopeeChannelSchema },
      { name: "shopeeproducts", schema: ShopeeProductSchema }
    ])
  ],
  controllers: [ShopeeIncomesController],
  providers: [ShopeeIncomesService],
  exports: [ShopeeIncomesService]
})
export class ShopeeIncomesModule {}
