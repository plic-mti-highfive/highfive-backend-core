import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateChecklistItemDto {
  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsBoolean()
  @IsOptional()
  isCompleted?: boolean;
}
