import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectVisibility } from '@plic-mti-highfive/shared-types';

export class CreateProjectDto {
  @ApiProperty({ example: 'My Awesome Project' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

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
