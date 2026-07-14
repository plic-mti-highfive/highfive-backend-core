import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectHighfive } from './entities/project-highfive.entity.js';
import { Project } from '../projects/entities/project.entity.js';
import { ProjectHighfivesService } from './project-highfives.service.js';
import { ProjectHighfivesController } from './project-highfives.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectHighfive, Project])],
  controllers: [ProjectHighfivesController],
  providers: [ProjectHighfivesService],
  exports: [ProjectHighfivesService],
})
export class ProjectHighfivesModule {}
