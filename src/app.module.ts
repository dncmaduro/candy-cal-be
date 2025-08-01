import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { MongooseModule } from "@nestjs/mongoose"
import { DatabaseModule } from "./database/database.module"
import { UsersModule } from "./users/users.module"
import { ItemsModule } from "./items/items.module"
import { ProductsModule } from "./products/products.module"
import { JwtModule } from "@nestjs/jwt"
import { AuthModule } from "./auth/auth.module"
import { LogsModule } from "./logs/logs.module"
import { StorageLogsModule } from "./storagelogs/storagelogs.module"
import { StorageItemsModule } from "./storageitems/storageitems.module"
import { DeliveredRequestModule } from "./deliveredrequests/deliveredrequest.module"
import { NotificationsModule } from "./notifications/notifications.module"
import { ReadyCombosModule } from "./readycombos/readycombos.module"
import { OrderLogsModule } from "./orderlogs/orderlogs.module"
import { PackingRulesModule } from "./packingrules/packingrules.module"
import { IncomeModule } from "./income/income.module"
import { MonthGoalModule } from "./monthgoals/monthgoals.module"
import { SessionLogsModule } from "./sessionlogs/sessionlogs.module"
import { DailyLogsModule } from "./dailylogs/dailylogs.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    DatabaseModule,
    UsersModule,
    ItemsModule,
    LogsModule,
    StorageLogsModule,
    ProductsModule,
    JwtModule,
    StorageItemsModule,
    DeliveredRequestModule,
    NotificationsModule,
    ReadyCombosModule,
    OrderLogsModule,
    PackingRulesModule,
    MongooseModule.forRoot(process.env.DATABASE_URL, {
      dbName: "data"
    }),
    IncomeModule,
    MonthGoalModule,
    SessionLogsModule,
    DailyLogsModule,
    AuthModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}
