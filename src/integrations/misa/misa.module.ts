import { Module } from "@nestjs/common"
import { MisaCallbackIdempotencyService } from "./misa-callback-idempotency.service"
import { MisaCallbackService } from "./misa-callback.service"
import { MisaController } from "./misa.controller"

@Module({
  controllers: [MisaController],
  providers: [MisaCallbackService, MisaCallbackIdempotencyService]
})
export class MisaModule {}
