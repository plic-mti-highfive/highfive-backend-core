import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AnnouncementEntity,
  HighfiveEntity,
  MembershipEntity,
  UserEntity,
} from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { AnnouncementsController } from './announcements.controller.js';
import { AnnouncementsService } from './announcements.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      AnnouncementEntity,
      UserEntity,
      MembershipEntity,
      HighfiveEntity,
    ]),
    ProjectsModule,
  ],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService],
})
export class AnnouncementsModule {}
