import { ApiProperty } from '@nestjs/swagger';
import { ProjectResponseDto } from '../../../project-execution/projects/dto/project-response.dto.js';

export class UserProjectsResponseDto {
  @ApiProperty({
    description: 'Projects where user is OWNER',
    type: [ProjectResponseDto],
  })
  created!: ProjectResponseDto[];

  @ApiProperty({
    description: 'Projects where user is ADMIN/LEAD/MEMBER',
    type: [ProjectResponseDto],
  })
  collaborations!: ProjectResponseDto[];

  @ApiProperty({
    description: 'Projects user is following/liked',
    type: [ProjectResponseDto],
  })
  liked!: ProjectResponseDto[];
}
