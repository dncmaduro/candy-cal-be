import { Module } from "@nestjs/common"
import { TypeOrmModule } from "@nestjs/typeorm"
import { UsersService } from "./users.service"
import { UsersController } from "./users.controller"
import { User } from "src/database/typeorm/entities/User"

@Module({
  imports: [TypeOrmModule.forFeature([User])], // Register the User entity
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService] // Export UsersService if needed elsewhere
})
export class UsersModule {}
