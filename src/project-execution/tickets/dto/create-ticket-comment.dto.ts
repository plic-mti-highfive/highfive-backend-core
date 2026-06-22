import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTicketCommentDto {
  @ApiProperty({ example: "Je m'occupe de cette tâche demain matin." })
  @IsString()
  @IsNotEmpty()
  content!: string;
}
