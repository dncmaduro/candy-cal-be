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
    MongooseModule.forRoot(process.env.DATABASE_URL, {
      dbName: "data"
    }),
    AuthModule
  ],
  controllers: [],
  providers: []
})
export class AppModule {}
