import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { ConfigModule } from "@nestjs/config"
import { DatabaseModule } from "./database/database.module"
import { UsersModule } from "./users/users.module"

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ".env" }),
    DatabaseModule,
    UsersModule,
    TypeOrmModule.forRoot({
      type: "mongodb",
      url: process.env.DATABASE_URL,
      database: "data",
      entities: ["dist/database/typeorm/entities/*.js"],
      useUnifiedTopology: true,
      synchronize: true,
      logging: true
    })
  ],
  controllers: [],
  providers: []
})
export class AppModule {}
