import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectMember } from './entities/project-member.entity.js';
import { ProjectFollower } from './entities/project-follower.entity.js';
import { ProjectMembersService } from './project-members.service.js';
import { ProjectMembersController } from './project-members.controller.js';
import { UsersModule } from '../../identity/users/users.module.js';
import { Ticket } from '../tickets/entities/ticket.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectMember, ProjectFollower, Ticket]),
    UsersModule,
  ],
  controllers: [ProjectMembersController],
  providers: [ProjectMembersService],
  exports: [ProjectMembersService],
})
export class ProjectMembersModule {}
