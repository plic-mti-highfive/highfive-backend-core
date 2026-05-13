import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tag } from './entities/tag.entity.js';
import { Project } from '../projects/entities/project.entity.js';
import { TagsService } from './tags.service.js';
import { TagsController } from './tags.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Tag, Project])],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
