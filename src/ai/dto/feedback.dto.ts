import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  Min,
  Max
} from "class-validator"

export class CreateAiFeedbackDto {
  @IsString()
  @IsNotEmpty()
  conversationId: string

  @IsString()
  @IsNotEmpty()
  description: string

  @IsString()
  @IsOptional()
  expected?: string

  @IsString()
  @IsOptional()
  actual?: string

  @IsInt()
  @Min(1)
  @Max(5)
  @IsOptional()
  rating?: number
}
