import { IsString, IsBoolean, IsOptional } from 'class-validator';
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
}
