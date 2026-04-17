import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ShopeeIncomesService } from "./shopeeincomes.service"
import { ShopeeIncomesController } from "./shopeeincomes.controller"
import { ShopeeIncomeSchema } from "../database/mongoose/schemas/ShopeeIncome"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"
import { ShopeeProductSchema } from "../database/mongoose/schemas/ShopeeProduct"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "shopeeincomes", schema: ShopeeIncomeSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema },
      { name: "shopeeproducts", schema: ShopeeProductSchema }
    ])
  ],
  controllers: [ShopeeIncomesController],
  providers: [ShopeeIncomesService],
  exports: [ShopeeIncomesService]
})
export class ShopeeIncomesModule {}
