import { HttpException, HttpStatus, Injectable } from "@nestjs/common"
import { IUsersService } from "./users"
import { InjectRepository } from "@nestjs/typeorm"
import { Repository } from "typeorm"
import { User } from "src/database/typeorm/entities/User"
import { LoginDto } from "./dto/login.dto"

@Injectable()
export class UsersService implements IUsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}

  async login(credential: LoginDto): Promise<User> {
    try {
      const existingUser = await this.userRepository.findOne({
        where: {
          username: credential.username
        }
      })

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
