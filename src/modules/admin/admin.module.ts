import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AdminActionEntity,
  CommentEntity,
  ProjectEntity,
  ReportEntity,
  UserEntity,
} from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { AdminBootstrapService } from './admin-bootstrap.service.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReportEntity,
      AdminActionEntity,
      UserEntity,
      ProjectEntity,
      CommentEntity,
    ]),
    ProjectsModule,
    TagsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, AdminBootstrapService],
})
export class AdminModule {}
