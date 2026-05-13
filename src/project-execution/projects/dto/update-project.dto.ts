import { IsString, IsOptional, IsEnum, IsArray, IsUUID } from 'class-validator';
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

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @ApiPropertyOptional({ enum: ProjectVisibility })
  @IsEnum(ProjectVisibility)
  @IsOptional()
  visibility?: ProjectVisibility;

  @ApiPropertyOptional({ type: [String] })
  @IsArray()
  @IsUUID('all', { each: true })
  @IsOptional()
  tagIds?: string[];
}
