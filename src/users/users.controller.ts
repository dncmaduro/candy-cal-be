import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
  Request,
  Req
} from "@nestjs/common"
import { UsersService } from "./users.service"
import { LoginDto, RefreshTokenDto, ValidTokenDto } from "./dto/login.dto"
import { JwtAuthGuard } from "src/auth/jwt-auth-guard"

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() credential: LoginDto
  ): Promise<{ accessToken: string; refreshToken: string }> {
    return this.usersService.login(credential)
  }

  @Post("refresh-token")
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() credential: RefreshTokenDto
  ): Promise<{ accessToken: string }> {
    return this.usersService.refreshToken(credential)
  }

  @Post("check-token")
  @HttpCode(HttpStatus.OK)
  async isTokenValid(
    @Body() credential: ValidTokenDto
  ): Promise<{ valid: boolean }> {
    return this.usersService.isTokenValid(credential)
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  @HttpCode(HttpStatus.OK)
  async getMe(
    @Req() req
  ): Promise<{ username: string; name: string; role: string }> {
    return this.usersService.getMe(req.user.username)
  }
}
