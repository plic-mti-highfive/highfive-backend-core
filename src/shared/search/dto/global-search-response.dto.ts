import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectResponseDto } from '../../../project-execution/projects/dto/project-response.dto';
import { MinimalProfileDto } from '../../../identity/user-profiles/dto/user-profile-response.dto';

class PaginatedProjectsResult {
  @ApiProperty({ type: [ProjectResponseDto] })
  data: ProjectResponseDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

class PaginatedUsersResult {
  @ApiProperty({ type: [MinimalProfileDto] })
  data: MinimalProfileDto[];

  @ApiProperty()
  total: number;

  @ApiProperty()
  page: number;

  @ApiProperty()
  limit: number;

  @ApiProperty()
  totalPages: number;
}

// TODO
class PaginatedProgressResult {
  @ApiProperty({ type: [Object] })
  data: any[];
}

export class GlobalSearchResponseDto {
  @ApiPropertyOptional({ type: PaginatedProjectsResult })
  projects?: PaginatedProjectsResult;

  @ApiPropertyOptional({ type: PaginatedUsersResult })
  users?: PaginatedUsersResult;

  @ApiPropertyOptional({ type: PaginatedProgressResult })
  progress?: PaginatedProgressResult;

  @ApiPropertyOptional()
  tags?: string[];
}
