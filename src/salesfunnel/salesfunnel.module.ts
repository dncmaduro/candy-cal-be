import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { SalesFunnelController } from "./salesfunnel.controller"
import { SalesFunnelService } from "./salesfunnel.service"
import { SalesFunnelSchema } from "../database/mongoose/schemas/SalesFunnel"
import { SystemLogsModule } from "../systemlogs/systemlogs.module"
import { ProvinceSchema } from "../database/mongoose/schemas/Province"
import { SalesChannelSchema } from "../database/mongoose/schemas/SalesChannel"

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: "salesfunnel", schema: SalesFunnelSchema },
      { name: "provinces", schema: ProvinceSchema },
      { name: "saleschannels", schema: SalesChannelSchema }
    ]),
    SystemLogsModule
  ],
  controllers: [SalesFunnelController],
  providers: [SalesFunnelService],
  exports: [SalesFunnelService]
})
export class SalesFunnelModule {}
