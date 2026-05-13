import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Project } from '../../project-execution/projects/entities/project.entity.js';
import { User } from '../../identity/users/entities/user.entity.js';
import { Tag } from '../../project-execution/tags/entities/tag.entity.js';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';

// NOTE: boilerplate module — wraps a basic ILIKE search until the
// discovery/matchmaking service comes online.
@Module({
  imports: [TypeOrmModule.forFeature([Project, User, Tag])],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
