import { Module } from "@nestjs/common"
import { ConfigModule } from "@nestjs/config"
import { MongooseModule } from "@nestjs/mongoose"
import { DatabaseModule } from "./database/database.module"
import { UsersModule } from "./users/users.module"
import { ItemsModule } from "./items/items.module"
import { ProductsModule } from "./products/products.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    DatabaseModule,
    UsersModule,
    ItemsModule,
    ProductsModule,
    MongooseModule.forRoot(process.env.DATABASE_URL, {
      dbName: "data"
    })
  ],
  controllers: [],
  providers: []
})
export class AppModule {}
