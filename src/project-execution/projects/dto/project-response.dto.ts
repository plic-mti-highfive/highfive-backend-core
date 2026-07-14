import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ProjectStatus,
  ProjectVisibility,
} from '@plic-mti-highfive/shared-types';
import { MinimalProfileDto } from '../../../identity/user-profiles/dto/user-profile-response.dto';
import { Project } from '../entities/project.entity';
import { User } from '../../../identity/users/entities/user.entity';

export class ProjectResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiPropertyOptional()
  description!: string | null;

  @ApiProperty({ enum: ProjectStatus })
  status!: ProjectStatus;

  @ApiProperty({ enum: ProjectVisibility })
  visibility!: ProjectVisibility;

  @ApiProperty({ type: [String] })
  tags!: string[];

  @ApiProperty()
  highfiveCount!: number;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiProperty({ type: () => MinimalProfileDto })
  owner!: MinimalProfileDto | null;

  static fromEntity(project: Project, ownerUser: User): ProjectResponseDto {
    const dto = new ProjectResponseDto();
    dto.id = project.id;
    dto.name = project.name;
    dto.description = project.description;
    dto.tags = project.tags;
    dto.status = project.status;
    dto.visibility = project.visibility;
    dto.createdAt = project.createdAt;
    dto.updatedAt = project.updatedAt;

    dto.owner = ownerUser ? MinimalProfileDto.fromUser(ownerUser) : null;
    return dto;
  }
}
