import { Module } from "@nestjs/common"
import { MongooseModule } from "@nestjs/mongoose"
import { UsersService } from "./users.service"
import { UsersController } from "./users.controller"
import { UserSchema } from "src/database/mongoose/schemas/User"

@Module({
  imports: [
    MongooseModule.forFeature([{ name: "users", schema: UserSchema }]) // Register the User schema
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService] // Export UsersService if needed elsewhere
})
export class UsersModule {}
