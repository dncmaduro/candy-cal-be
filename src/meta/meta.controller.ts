import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards
} from "@nestjs/common"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"
import { RolesGuard } from "../roles/roles.guard"
import { MetaService } from "./meta.service"
import { Roles } from "../roles/roles.decorator"

@Controller("meta")
@UseGuards(JwtAuthGuard, RolesGuard)
export class MetaController {
  constructor(private readonly metaService: MetaService) {}

  @Roles("admin", "sales-emp")
  @Get("conversations")
  async listConversations(@Query("page") page = 1, @Query("limit") limit = 10) {
    return this.metaService.listConversations(page, limit)
  }

  @Roles("admin", "sales-emp")
  @Get("conversations/:id/messages")
  async listMessages(
    @Param("id") conversationId: string,
    @Query("after") after?: string,
    @Query("before") before?: string
  ) {
    return this.metaService.listMessages(conversationId, { after, before })
  }

  @Roles("admin", "sales-emp")
  @Get("conversations/:conversationId/psid")
  async getPsidByConversationId(
    @Param("conversationId") conversationId: string
  ) {
    return this.metaService.getPsidByConversationId(conversationId)
  }

  @Roles("admin", "sales-emp")
  @Get("conversations/:psid/conversationId")
  async getConversationIdByPsid(@Param("psid") psid: string) {
    return this.metaService.getConversationIdByPsid(psid)
  }

  @Roles("admin", "sales-emp")
  @Post("conversations/:psid/send")
  async sendText(@Param("psid") psid: string, @Body() body: { text: string }) {
    return this.metaService.sendText(psid, body.text)
  }

  @Roles("admin", "sales-emp")
  @Get("profile/:psid")
  async getProfileByPsid(@Param("psid") psid: string) {
    return this.metaService.getProfileByPsid(psid)
  }
}
