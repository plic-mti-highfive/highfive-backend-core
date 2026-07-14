import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
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

  @ApiPropertyOptional({ type: [String], example: ['React', 'Node.js'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  tags?: string[];

  @ApiPropertyOptional({ enum: ProjectVisibility })
  @IsEnum(ProjectVisibility)
  @IsOptional()
  visibility?: ProjectVisibility;
}
