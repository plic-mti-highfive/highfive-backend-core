import { ApiProperty } from '@nestjs/swagger';
import { Project } from '../../../project-execution/projects/entities/project.entity.js';

export class UserProjectsResponseDto {
  @ApiProperty({ description: 'Projects where user is OWNER' })
  created!: Project[];

  @ApiProperty({ description: 'Projects where user is ADMIN/LEAD/MEMBER' })
  collaborations!: Project[];

  @ApiProperty({ description: 'Projects user is following/liked' })
  liked!: Project[];
}
