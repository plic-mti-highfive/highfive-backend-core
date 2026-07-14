import { IsString, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectStatus,
  ProjectVisibility,
} from '@plic-mti-highfive/shared-types';

export class UpdateProjectDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @ApiPropertyOptional({ enum: ProjectVisibility })
  @IsEnum(ProjectVisibility)
  @IsOptional()
  visibility?: ProjectVisibility;
}
