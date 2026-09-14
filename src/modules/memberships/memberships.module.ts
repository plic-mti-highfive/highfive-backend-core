import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  InvitationEntity,
  JoinRequestEntity,
  MembershipEntity,
  UserEntity,
} from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { MembershipsController } from './memberships.controller.js';
import { MembershipsService } from './memberships.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      MembershipEntity,
      JoinRequestEntity,
      InvitationEntity,
      UserEntity,
    ]),
    ProjectsModule,
  ],
  controllers: [MembershipsController],
  providers: [MembershipsService],
  exports: [MembershipsService],
})
export class MembershipsModule {}
