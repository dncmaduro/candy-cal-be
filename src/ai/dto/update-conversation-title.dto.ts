import { IsString, IsNotEmpty } from "class-validator"

export class UpdateConversationTitleDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string

  @IsString()
  @IsNotEmpty()
  title: string
}
