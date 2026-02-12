import { IsString, IsNotEmpty, IsOptional } from "class-validator"

export class AskAiDto {
  @IsString()
  @IsNotEmpty()
  question: string

  @IsString()
  @IsOptional()
  conversationId?: string
}
