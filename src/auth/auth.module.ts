import { Module } from "@nestjs/common"
import { JwtModule } from "@nestjs/jwt"
import { PassportModule } from "@nestjs/passport"
import { JwtStrategy } from "./jwt.strategy"

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: "10days" }
    })
  ],
  providers: [JwtStrategy],
  exports: [JwtModule, JwtStrategy]
})
export class AuthModule {}
