import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ShopeeIncomesService } from "./shopeeincomes.service"
import { ShopeeIncomesController } from "./shopeeincomes.controller"
import { ShopeeIncomeSchema } from "../database/mongoose/schemas/ShopeeIncome"
import { ShopeeProductSchema } from "../database/mongoose/schemas/ShopeeProduct"
import { LivestreamChannelSchema } from "../database/mongoose/schemas/LivestreamChannel"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "shopeeincomes", schema: ShopeeIncomeSchema },
      { name: "ShopeeProduct", schema: ShopeeProductSchema },
      { name: "livestreamchannels", schema: LivestreamChannelSchema }
    ])
  ],
  controllers: [ShopeeIncomesController],
  providers: [ShopeeIncomesService],
  exports: [ShopeeIncomesService]
})
export class ShopeeIncomesModule {}
