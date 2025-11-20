import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesFunnelController } from "./salesfunnel.controller"
import { SalesFunnelService } from "./salesfunnel.service"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"
import { ProvinceSchema } from "../database/mongoose/schemas/Province"
import { SalesChannelSchema } from "../database/mongoose/schemas/SalesChannel"
import { UserSchema } from "../database/mongoose/schemas/User"
import { SalesOrderSchema } from "../database/mongoose/schemas/SalesOrder"
import { SalesCustomerRankSchema } from "../database/mongoose/schemas/SalesCustomerRank"
import { SalesActivitySchema } from "../database/mongoose/schemas/SalesActivity"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesfunnel", schema: SalesFunnelSchema },
      { name: "provinces", schema: ProvinceSchema },
      { name: "saleschannels", schema: SalesChannelSchema },
      { name: "users", schema: UserSchema },
      { name: "salesorders", schema: SalesOrderSchema },
      { name: "salescustomerranks", schema: SalesCustomerRankSchema },
      { name: "salesactivities", schema: SalesActivitySchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesFunnelController],
  providers: [SalesFunnelService],
  exports: [SalesFunnelService]
})
export class SalesFunnelModule {}
