import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ColumnEntity,
  MembershipEntity,
  NeedEntity,
  ProjectEntity,
  UserEntity,
  WallEntity,
} from '../../entities/index.js';
import { TagsModule } from '../tags/tags.module.js';
import { ProjectAccessService } from './project-access.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      MembershipEntity,
      NeedEntity,
      ColumnEntity,
      WallEntity,
      UserEntity,
    ]),
    TagsModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectAccessService, ProjectsService],
  exports: [ProjectAccessService, ProjectsService],
})
export class ProjectsModule {}
