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
  Delete,
  Patch
} from "@nestjs/common"
import { AiService } from "./ai.service"
import { AskAiDto } from "./dto/ask.dto"
import { CreateAiFeedbackDto } from "./dto/feedback.dto"
import { UpdateConversationTitleDto } from "./dto/update-conversation-title.dto"
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
    const debug =
      String(req?.headers?.["x-ai-debug"] || "").toLowerCase() === "true"
    return this.aiService.ask(
      body.question,
      body.module,
      req.user?.userId,
      body.conversationId,
      debug
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

  @Patch("conversations/title")
  @HttpCode(HttpStatus.OK)
  async updateConversationTitle(
    @Req() req: any,
    @Body() body: UpdateConversationTitleDto
  ): Promise<{ conversationId: string; title: string }> {
    return this.aiService.updateConversationTitle(
      req.user?.userId,
      body.conversationId,
      body.title
    )
  }

  @Post("feedback")
  @HttpCode(HttpStatus.CREATED)
  async createFeedback(
    @Req() req: any,
    @Body() body: CreateAiFeedbackDto
  ): Promise<{
    feedbackId: string
    conversationId: string
    createdAt: Date
  }> {
    return this.aiService.createFeedback(req.user?.userId, body)
  }

  @Get("feedback")
  @HttpCode(HttpStatus.OK)
  async listFeedback(
    @Req() req: any,
    @Query("conversationId") conversationId?: string,
    @Query("limit") limit?: string
  ): Promise<{
    data: Array<{
      feedbackId: string
      conversationId: string
      description: string
      expected?: string
      actual?: string
      rating?: number
      createdAt: Date
    }>
  }> {
    return this.aiService.listFeedback(
      req.user?.userId,
      conversationId,
      Number(limit) || 20
    )
  }
}
