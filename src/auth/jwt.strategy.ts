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
    // Roles can be changed while an access/refresh token is still valid. Read
    // the current user so authorization reflects that change immediately.
    const user = await this.users
      .findById(payload.sub)
      .select("username roles active")
      .lean()
    if (!user || user.active === false) {
      throw new UnauthorizedException("Tài khoản không còn hoạt động")
    }
    return {
      userId: user._id.toString(),
      username: user.username,
      roles: user.roles || []
    }
  }
}
