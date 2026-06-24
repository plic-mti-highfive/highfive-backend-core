import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectStatus,
  ProjectVisibility,
} from '@plic-mti-highfive/shared-types';

export class ProjectResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  description: string | null;

  @ApiProperty({ enum: ProjectStatus })
  status: ProjectStatus;

  @ApiProperty({ enum: ProjectVisibility })
  visibility: ProjectVisibility;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  highfiveCount: number;

  @ApiProperty()
  createdAt: Date;
}
