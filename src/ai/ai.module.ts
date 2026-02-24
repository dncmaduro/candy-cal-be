import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { AiController } from "./ai.controller"
import { AiService } from "./ai.service"
import { AiUsageSchema } from "../database/mongoose/schemas/AiUsage"
import { StorageItemSchema } from "../database/mongoose/schemas/StorageItem"
import { AiUserUsageSchema } from "../database/mongoose/schemas/AiUserUsage"
import { AiConversationSchema } from "../database/mongoose/schemas/AiConversation"
import { AiFeedbackSchema } from "../database/mongoose/schemas/AiFeedback"
import { ProductSchema } from "../database/mongoose/schemas/Product"
import { StorageLogSchema } from "../database/mongoose/schemas/StorageLog"
import { IncomeModule } from "../income/income.module"

@Module({
  imports: [
    IncomeModule,
    MongooseModule.forFeature([
      { name: "aiusages", schema: AiUsageSchema },
      { name: "aiuserusages", schema: AiUserUsageSchema },
      { name: "aiconversations", schema: AiConversationSchema },
      { name: "aifeedbacks", schema: AiFeedbackSchema },
      { name: "storageitems", schema: StorageItemSchema },
      { name: "products", schema: ProductSchema },
      { name: "storagelogs", schema: StorageLogSchema }
    ])
  ],
  controllers: [AiController],
  providers: [AiService]
})
export class AiModule {}
