import {
  IsOptional,
  IsEnum,
  IsInt,
  Min,
  Max,
  IsIn,
  IsString,
  IsArray,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectStatus,
  ProjectVisibility,
} from '@plic-mti-highfive/shared-types';

export class QueryProjectDto {
  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsEnum(ProjectStatus)
  @IsOptional()
  status?: ProjectStatus;

  @ApiPropertyOptional({ enum: ProjectVisibility })
  @IsEnum(ProjectVisibility)
  @IsOptional()
  visibility?: ProjectVisibility;

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;

  @ApiPropertyOptional({ default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }) => {
    if (value === undefined) return value;
    return Array.isArray(value) ? value : [value];
  })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['date', 'name', 'popularity'])
  sortBy?: 'date' | 'name' | 'popularity' = 'date';

  @ApiPropertyOptional()
  @IsOptional()
  @IsIn(['ASC', 'DESC'])
  sortOrder?: 'ASC' | 'DESC' = 'DESC';
}
