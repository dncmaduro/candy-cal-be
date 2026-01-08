import { Controller, Get } from "@nestjs/common"

@Controller("greet")
export class GreetController {
  @Get()
  greet(): string {
    return "Greet World!"
  }
}
