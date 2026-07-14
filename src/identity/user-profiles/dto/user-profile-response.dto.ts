import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProjectResponseDto } from '../../../project-execution/projects/dto/project-response.dto.js';

class ProfileSkillDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
}

class ProfileStatsDto {
  @ApiProperty() projectsCreated!: number;
  @ApiProperty() projectsContributed!: number;
  @ApiProperty() followers!: number;
  @ApiProperty() following!: number;
}

class ProfileProjectsDto {
  @ApiProperty({ type: [ProjectResponseDto] }) created!: ProjectResponseDto[];
  @ApiProperty({ type: [ProjectResponseDto] })
  collaborations!: ProjectResponseDto[];
  @ApiProperty({ type: [ProjectResponseDto] }) liked!: ProjectResponseDto[];
}

export class UserProfileResponseDto {
  @ApiProperty()
  userId!: string;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  email!: string;

  @ApiPropertyOptional({ type: String, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  bio!: string | null;

  @ApiPropertyOptional({ type: String, nullable: true })
  avatarPath!: string | null;

  @ApiProperty()
  themePreference!: string;

  @ApiProperty()
  emailNotifications!: boolean;

  @ApiProperty({ type: [ProfileSkillDto] })
  skills!: ProfileSkillDto[];

  @ApiProperty({ type: ProfileStatsDto })
  stats!: ProfileStatsDto;

  @ApiProperty({ type: ProfileProjectsDto })
  projects!: ProfileProjectsDto;
}
