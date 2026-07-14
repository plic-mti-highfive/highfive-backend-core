import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateChecklistItemDto {
  @ApiProperty({ example: 'Mettre à jour la doc API' })
  @IsString()
  @IsNotEmpty()
  content!: string;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;
}
