import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfile } from './entities/user-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserSkill } from '../skills/entities/user-skill.entity.js';
import { UserConnection } from '../user-connections/entities/user-connection.entity.js';
import { ProjectMember } from '../../project-execution/project-members/entities/project-member.entity.js';
import { UserProfilesService } from './user-profiles.service.js';
import { UserProfilesController } from './user-profiles.controller.js';
import { ProjectsModule } from '../../project-execution/projects/projects.module.js';
import { ProjectHighfivesModule } from '../../project-execution/project-highfives/project-highfives.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserProfile,
      User,
      UserSkill,
      UserConnection,
      ProjectMember,
    ]),
    ProjectsModule,
    ProjectHighfivesModule,
  ],
  controllers: [UserProfilesController],
  providers: [UserProfilesService],
  exports: [UserProfilesService],
})
export class UserProfilesModule {}
