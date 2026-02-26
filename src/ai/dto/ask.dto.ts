import { IsString, IsNotEmpty, IsOptional, IsIn } from "class-validator"

export class AskAiDto {
  @IsString()
  @IsNotEmpty()
  question: string

  @IsString()
  @IsNotEmpty()
  @IsIn(["storage", "livestream"])
  module: "storage" | "livestream"

  @IsString()
  @IsOptional()
  conversationId?: string
}
