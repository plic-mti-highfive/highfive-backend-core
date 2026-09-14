import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  MembershipEntity,
  ProjectEntity,
  TagEntity,
  UserEntity,
} from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TagsModule } from '../tags/tags.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectEntity,
      UserEntity,
      TagEntity,
      MembershipEntity,
    ]),
    ProjectsModule,
    TagsModule,
  ],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
