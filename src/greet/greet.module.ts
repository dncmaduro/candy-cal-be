import { Module } from "@nestjs/common"
import { GreetController } from "./greet.controller"

@Module({
  controllers: [GreetController]
})
export class GreetModule {}
