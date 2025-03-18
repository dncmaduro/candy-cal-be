import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { IUsersService } from "./users"
import { InjectModel } from "@nestjs/mongoose"
import { Model } from "mongoose"
import { User } from "src/database/mongoose/schemas/User"
import { LoginDto } from "./dto/login.dto"

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @InjectModel("users")
    private readonly userModel: Model<User>
  ) {}

  async login(credential: LoginDto): Promise<User> {
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

      return existingUser
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
}
