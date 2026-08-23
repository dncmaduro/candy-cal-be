import { Injectable, UnauthorizedException } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { PassportStrategy } from "@nestjs/passport"
import { ExtractJwt, Strategy } from "passport-jwt"
import { Model } from "mongoose"
import { User } from "../database/mongoose/schemas/User"

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@InjectModel("users") private readonly users: Model<User>) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET
    })
  }

  async validate(payload: any) {
    // Permissions live in the database, not the JWT. This keeps Authorization
    // headers small and makes permission changes effective immediately.
    const user = await this.users
      .findById(payload.sub)
      .select("username roles permissions active")
      .lean()
    if (!user || user.active === false) {
      throw new UnauthorizedException("Tài khoản không còn hoạt động")
    }
    return {
      userId: user._id.toString(),
      username: user.username,
      roles: user.roles || [], // Temporary compatibility for ownership rules outside @Roles.
      permissions: user.permissions || []
    }
  }
}
