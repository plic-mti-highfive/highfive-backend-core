import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfile } from './entities/user-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserConnection } from '../user-connections/entities/user-connection.entity.js';
import { ProjectMember } from '../../project-execution/project-members/entities/project-member.entity.js';
import { ProjectFollower } from '../../project-execution/project-members/entities/project-follower.entity.js';
import { UserProfilesService } from './user-profiles.service.js';
import { UserProfilesController } from './user-profiles.controller.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserProfile,
      User,
      UserConnection,
      ProjectMember,
      ProjectFollower,
    ]),
  ],
  controllers: [UserProfilesController],
  providers: [UserProfilesService],
  exports: [UserProfilesService],
})
export class UserProfilesModule {}
