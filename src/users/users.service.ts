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
import { SystemLogsService } from "../systemlogs/systemlogs.service"

@Injectable()
export class UsersService {
  constructor(
    @InjectModel("users")
    private readonly userModel: Model<User>,
    private readonly jwtService: JwtService,
    private readonly systemLogsService: SystemLogsService
  ) {}

  async login(
    credential: LoginDto
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const username = credential.username
    try {
      const existingUser = await this.userModel
        .findOne({
          username: credential.username
        })
        .exec()

      if (!existingUser) {
        // log failed login
        void this.systemLogsService.createSystemLog(
          {
            type: "auth",
            action: "login_failed",
            entity: "user",
            entityId: username,
            result: "failed"
          },
          "unknown"
        )
        throw new HttpException("Wrong username", HttpStatus.UNAUTHORIZED)
      }

      if (existingUser.password !== credential.password) {
        // log failed login
        void this.systemLogsService.createSystemLog(
          {
            type: "auth",
            action: "login_failed",
            entity: "user",
            entityId: username,
            result: "failed"
          },
          existingUser._id.toString()
        )
        throw new HttpException("Wrong password", HttpStatus.UNAUTHORIZED)
      }

      const payload = {
        username: existingUser.username,
        sub: existingUser._id,
        roles: existingUser.roles
      }
      const accessToken = this.jwtService.sign(payload, { expiresIn: "30m" })
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: "120 days"
      })

      // log success login
      void this.systemLogsService.createSystemLog(
        {
          type: "auth",
          action: "login_success",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success"
        },
        existingUser._id.toString()
      )

      return { accessToken, refreshToken }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      // unexpected error log
      void this.systemLogsService.createSystemLog(
        {
          type: "system",
          action: "unexpected_error",
          entity: "auth",
          entityId: username,
          result: "failed",
          meta: { scope: "login" }
        },
        "unknown"
      )
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
        roles: decoded.roles
      }
      const accessToken = this.jwtService.sign(payload, { expiresIn: "30m" })
      const refreshToken = this.jwtService.sign(payload, {
        expiresIn: "120 days"
      })

      // per request, do not log token refresh actions
      return { accessToken, refreshToken }
    } catch (error) {
      // per request, do not log token refresh failures
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
    roles: string[]
    avatarUrl?: string
    _id: string
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
        roles: existingUser.roles,
        avatarUrl: existingUser.avatarUrl,
        _id: existingUser._id.toString()
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

      void this.systemLogsService.createSystemLog(
        {
          type: "users",
          action: "password_changed",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success"
        },
        existingUser._id.toString()
      )

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

      void this.systemLogsService.createSystemLog(
        {
          type: "users",
          action: "avatar_updated",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success"
        },
        existingUser._id.toString()
      )

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

      void this.systemLogsService.createSystemLog(
        {
          type: "users",
          action: "profile_updated",
          entity: "user",
          entityId: existingUser._id.toString(),
          result: "success",
          meta: { fields: Object.keys(dto) }
        },
        existingUser._id.toString()
      )

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
