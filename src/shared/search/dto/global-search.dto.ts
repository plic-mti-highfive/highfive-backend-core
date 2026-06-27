import {
  IsOptional,
  IsString,
  IsArray,
  IsEnum,
  IsInt,
  Min,
  IsIn,
  Max,
} from 'class-validator';
import { Transform, TransformFnParams, Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { SearchEntityType } from '@plic-mti-highfive/shared-types';

export class GlobalSearchDto {
  @ApiPropertyOptional({ enum: SearchEntityType, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(SearchEntityType, { each: true })
  @Transform(({ value }: TransformFnParams) => {
    if (value === undefined) return undefined;
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((v) => String(v));
  })
  types?: SearchEntityType[];

  @ApiPropertyOptional({ default: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @IsOptional()
  offset?: number = 0;

  @ApiPropertyOptional({ default: 5 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number = 5;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Type(() => String)
  @Transform(({ value }: TransformFnParams) => {
    if (value === undefined) return undefined;
    const arr = Array.isArray(value) ? value : [value];
    return arr.map((v) => String(v));
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
