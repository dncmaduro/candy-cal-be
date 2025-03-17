import { Module } from "@nestjs/common"
import { ConfigService, ConfigModule } from "@nestjs/config"
import { TypeOrmModule } from "@nestjs/typeorm"
import { User } from "./typeorm/entities/User"

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        type: "mongodb",
        url: process.env.DATABASE_URL,
        database: "data",
        // url: 'mongodb+srv://admin:JgwY2q04RYT6CWbw@candy.x42d9.mongodb.net/',
        entities: [User],
        useUnifiedTopology: true,
        synchronize: true,
        logging: true
      })
    })
  ]
})
export class DatabaseModule {}
