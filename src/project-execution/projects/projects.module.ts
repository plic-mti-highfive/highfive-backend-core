import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from './entities/project.entity.js';
import { Tag } from '../tags/entities/tag.entity.js';
import { ProjectMember } from '../project-members/entities/project-member.entity.js';
import { ProjectHighfive } from '../project-highfives/entities/project-highfive.entity.js';
import { ProjectsService } from './projects.service.js';
import { ProjectsController } from './projects.controller.js';
import { ProjectMembersModule } from '../project-members/project-members.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Project, Tag, ProjectMember, ProjectHighfive]),
    ProjectMembersModule,
  ],
  controllers: [ProjectsController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}
