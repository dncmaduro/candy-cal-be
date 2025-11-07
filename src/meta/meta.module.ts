import { Module } from "@nestjs/common"
import { MetaController } from "./meta.controller"
import { MetaService } from "./meta.service"
import { MetaWebhookController } from "./meta-webhook.controller"
import { SalesFunnelModule } from "../salesfunnel/salesfunnel.module"
import { NotificationsModule } from "../notifications/notifications.module"
import { MetaGateway } from "./meta.gateway"
import { SalesChannelsModule } from "../saleschannels/saleschannels.module"

@Module({
  imports: [SalesFunnelModule, NotificationsModule, SalesChannelsModule],
  exports: [MetaService],
  controllers: [MetaController, MetaWebhookController],
  providers: [MetaService, MetaGateway]
})
export class MetaModule {}
