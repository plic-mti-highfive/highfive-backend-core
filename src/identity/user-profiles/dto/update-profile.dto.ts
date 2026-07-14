import { IsString, IsBoolean, IsOptional, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  displayName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  avatarPath?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  themePreference?: string;

  @ApiPropertyOptional()
  @IsBoolean()
  @IsOptional()
  emailNotifications?: boolean;

  @ApiPropertyOptional({
    type: [String],
    example: ['C++', 'Peinture', 'Skateboard'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  skills?: string[];
}
