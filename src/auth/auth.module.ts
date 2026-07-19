import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { PassportModule } from "@nestjs/passport"
import { MongooseModule } from "@nestjs/mongoose"
import { JwtStrategy } from "./jwt.strategy"
import { UserSchema } from "../database/mongoose/schemas/User"

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([{ name: "users", schema: UserSchema }]),
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "10days" }
    })
  ],
  controllers: [],
  providers: [JwtStrategy],
  exports: [JwtModule, JwtStrategy]
})
export class AuthModule {}
