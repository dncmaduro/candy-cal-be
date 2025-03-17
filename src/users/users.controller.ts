import { Controller, Post, Body, HttpCode, HttpStatus } from "@nestjs/common"
import { UsersService } from "./users.service"
import { LoginDto } from "./dto/login.dto"
import { User } from "src/database/typeorm/entities/User"

@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(@Body() credential: LoginDto): Promise<User> {
    return this.usersService.login(credential)
  }
}
