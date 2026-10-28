import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ColumnEntity,
  AdminActionEntity,
  MembershipEntity,
  NeedEntity,
  ProjectEntity,
  ProjectImageEntity,
  UserEntity,
  WallEntity,
} from '../../entities/index.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { CustomizationController } from './customization.controller.js';
import { CustomizationService } from './customization.service.js';
import { ProjectImagesService } from './project-images.service.js';
import { ProjectAccessService } from './project-access.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      ProjectImageEntity,
      AdminActionEntity,
      MembershipEntity,
      NeedEntity,
      ColumnEntity,
      WallEntity,
      UserEntity,
    ]),
    TagsModule,
    NotificationsModule,
  ],
  controllers: [ProjectsController, CustomizationController],
  providers: [
    ProjectAccessService,
    ProjectImagesService,
    CustomizationService,
    ProjectsService,
  ],
  exports: [ProjectAccessService, ProjectImagesService, ProjectsService],
})
export class ProjectsModule {}
