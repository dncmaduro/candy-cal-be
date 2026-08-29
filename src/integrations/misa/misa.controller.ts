import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common"
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger"
import { parseMisaCallbackDto } from "./dto/misa-callback.dto"
import { MisaCallbackService } from "./misa-callback.service"

@ApiTags("MISA integration")
@Controller("api/integrations/misa")
export class MisaController {
  constructor(private readonly misaCallbackService: MisaCallbackService) {}

  @Post("callback")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Receive an asynchronous MISA AMIS Accounting callback" })
  @ApiBody({
    schema: {
      type: "object",
      required: ["success", "data_type", "org_company_code", "data"],
      properties: {
        success: { type: "boolean" },
        error_code: { type: "string" },
        error_message: { type: "string" },
        signature: { type: "string" },
        data_type: { type: "integer", example: 1 },
        org_company_code: { type: "string" },
        app_id: { type: "string" },
        request_id: { type: "string" },
        data: { oneOf: [{ type: "string" }, { type: "object" }, { type: "array" }] }
      }
    }
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Callback accepted" })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: "Invalid MISA signature" })
  async receiveCallback(@Body() body: unknown): Promise<{ success: true }> {
    const callback = parseMisaCallbackDto(body)
    await this.misaCallbackService.handleCallback(callback)
    return { success: true }
  }
}
