import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { ProvinceSchema } from "../database/mongoose/schemas/Province"
import { ProvincesController } from "./provinces.controller"
import { ProvincesService } from "./provinces.service"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "provinces", schema: ProvinceSchema }])
  ],
  controllers: [ProvincesController],
  providers: [ProvincesService],
  exports: [ProvincesService]
})
export class ProvincesModule {}
