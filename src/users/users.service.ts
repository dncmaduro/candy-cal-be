import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { User } from "../database/mongoose/schemas/User"
import {
  ForgotPasswordDto,
  LoginDto,
  RefreshTokenDto,
  UpdateUserDto,
  ValidTokenDto
} from "./dto/login.dto"
import { JwtService } from "@nestjs/jwt"

@Injectable()
export class UsersService {
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

      const payload = {
        username: existingUser.username,
        sub: existingUser._id,
        role: existingUser.role
      }
      const accessToken = this.jwtService.sign(payload, { expiresIn: "30m" })
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: "120 days"
      })

      return { accessToken, refreshToken }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
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
      const payload = {
        username: decoded.username,
        sub: decoded.sub,
        role: decoded.role
      }
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

  async getMe(username: string): Promise<{
    username: string
    name: string
    role: string
    avatarUrl?: string
  }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      return {
        username: existingUser.username,
        name: existingUser.name,
        role: existingUser.role,
        avatarUrl: existingUser.avatarUrl
      }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async changePassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username: dto.username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      if (existingUser.password !== dto.oldPassword) {
        throw new HttpException("Wrong password", HttpStatus.UNAUTHORIZED)
      }

      existingUser.password = dto.newPassword
      await existingUser.save()
      return { message: "Password changed successfully" }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateAvatar(
    username: string,
    avatarUrl: string
  ): Promise<{ message: string }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      existingUser.avatarUrl = avatarUrl
      await existingUser.save()
      return { message: "Avatar updated successfully" }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  async updateUser(
    username: string,
    dto: UpdateUserDto
  ): Promise<{ message: string }> {
    try {
      const existingUser = await this.userModel
        .findOne({
          username
        })
        .exec()

      if (!existingUser) {
        throw new HttpException("User not found", HttpStatus.NOT_FOUND)
      }

      existingUser.name = dto.name
      await existingUser.save()
      return { message: "User updated successfully" }
    } catch (error) {
      console.error(error)
      throw new HttpException(
        "Internal server error",
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }
}
