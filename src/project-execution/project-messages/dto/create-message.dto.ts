import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMessageDto {
  @ApiProperty({ example: 'Hey team, check this out!' })
  @IsString()
  @IsNotEmpty()
  content: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  attachmentPath?: string;

  @ApiPropertyOptional({ description: 'ID of the message being replied to' })
  @IsUUID()
  @IsOptional()
  replyToId?: string;
}
