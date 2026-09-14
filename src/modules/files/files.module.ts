import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectFileEntity } from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { FilesController } from './files.controller.js';
import { FilesService } from './files.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectFileEntity]), ProjectsModule],
  controllers: [FilesController],
  providers: [FilesService],
})
export class FilesModule {}
