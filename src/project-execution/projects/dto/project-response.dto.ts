import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectStatus,
  ProjectVisibility,
} from '@plic-mti-highfive/shared-types';

export class ProjectResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  description!: string | null;

  @ApiProperty({ enum: ProjectStatus })
  status!: ProjectStatus;

  @ApiProperty({ enum: ProjectVisibility })
  visibility!: ProjectVisibility;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiPropertyOptional({ type: String, nullable: true })
  ownerId!: string | null;

  @ApiProperty()
  contributorsCount!: number;

  @ApiProperty()
  highfiveCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: Date, nullable: true })
  deletedAt!: Date | null;
}
