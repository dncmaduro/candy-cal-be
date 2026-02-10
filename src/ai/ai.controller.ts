import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Post,
  UseGuards,
  Req,
  Query,
  Delete
} from "@nestjs/common"
import { AiService } from "./ai.service"
import { AskAiDto } from "./dto/ask.dto"
import { JwtAuthGuard } from "../auth/jwt-auth.guard"

@Controller("ai")
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("ask")
  @HttpCode(HttpStatus.OK)
  async ask(
    @Body() body: AskAiDto,
    @Req() req: any
  ): Promise<{ answer: string; conversationId: string }> {
    return this.aiService.ask(
      body.question,
      req.user?.userId,
      body.conversationId
    )
  }

  @Get("usage")
  @HttpCode(HttpStatus.OK)
  async usage(@Req() req: any): Promise<{
    date: string
    count: number
    limit: number
    remaining: number
  }> {
    return this.aiService.getDailyUsage(req.user?.userId)
  }

  @Get("conversations")
  @HttpCode(HttpStatus.OK)
  async listConversations(
    @Req() req: any,
    @Query("limit") limit?: string
  ): Promise<{
    data: Array<{
      conversationId: string
      title: string
      updatedAt: Date
      expireAt: Date
      lastMessage?: string
    }>
  }> {
    return this.aiService.listConversations(
      req.user?.userId,
      Number(limit) || 20
    )
  }

  @Get("conversations/history")
  @HttpCode(HttpStatus.OK)
  async getConversationHistory(
    @Req() req: any,
    @Query("conversationId") conversationId?: string,
    @Query("limit") limit?: string,
    @Query("cursor") cursor?: string
  ): Promise<{
    conversationId: string
    messages: Array<{
      role: "user" | "assistant"
      content: string
      createdAt: Date
    }>
    nextCursor: number | null
    total: number
  }> {
    return this.aiService.getConversationHistory(
      req.user?.userId,
      conversationId,
      Number(limit) || 20,
      cursor ? Number(cursor) : undefined
    )
  }

  @Delete("conversations")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteConversation(
    @Req() req: any,
    @Query("conversationId") conversationId?: string
  ): Promise<void> {
    await this.aiService.deleteConversation(req.user?.userId, conversationId)
  }

  @Delete("conversations/history")
  @HttpCode(HttpStatus.NO_CONTENT)
  async clearConversationHistory(
    @Req() req: any,
    @Query("conversationId") conversationId?: string
  ): Promise<void> {
    await this.aiService.clearConversationHistory(
      req.user?.userId,
      conversationId
    )
  }
}
