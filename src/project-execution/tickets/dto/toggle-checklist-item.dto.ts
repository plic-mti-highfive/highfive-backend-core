import { IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ToggleChecklistItemDto {
  @ApiProperty({ example: true, description: 'Le nouvel état de la tâche' })
  @IsBoolean()
  @IsNotEmpty()
  isCompleted!: boolean;
}
