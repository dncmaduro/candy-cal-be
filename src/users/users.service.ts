import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { IUsersService } from "./users"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { User } from "src/database/mongoose/schemas/User"
import { LoginDto, RefreshTokenDto, ValidTokenDto } from "./dto/login.dto"
import { JwtService } from "@nestjs/jwt"

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @InjectModel("users")
    private readonly userModel: Model<User>,
    private readonly jwtService: JwtService
  ) {}

  async login(
    credential: LoginDto
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username: credential.username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("Wrong username", HttpStatus.UNAUTHORIZED)
      }

      if (existingUser.password !== credential.password) {
        throw new HttpException("Wrong password", HttpStatus.UNAUTHORIZED)
      }

      const payload = { username: existingUser.username, sub: existingUser._id }
      const accessToken = this.jwtService.sign(payload, { expiresIn: "30m" })
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: "120 days"
      })

      return { accessToken, refreshToken }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      console.log(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async refreshToken(
    credential: RefreshTokenDto
  ): Promise<{ accessToken: string; refreshToken: string }> {
    try {
      const decoded = this.jwtService.verify(credential.refreshToken)
      const payload = { username: decoded.username, sub: decoded.sub }
      const accessToken = this.jwtService.sign(payload, { expiresIn: "30m" })
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: "120 days"
      })
      return { accessToken, refreshToken }
    } catch (error) {
      throw new HttpException("Invalid refresh token", HttpStatus.UNAUTHORIZED)
    }
  }

  async isTokenValid(credential: ValidTokenDto): Promise<{ valid: boolean }> {
    try {
      this.jwtService.verify(credential.accessToken)
      return { valid: true }
    } catch (error) {
      return { valid: false }
    }
  }
}
