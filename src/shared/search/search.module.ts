import { Module } from '@nestjs/common';
import { SearchService } from './search.service.js';
import { SearchController } from './search.controller.js';
import { ProjectsModule } from '../../project-execution/projects/projects.module.js';
import { UserProfilesModule } from '../../identity/user-profiles/user-profiles.module.js';

@Module({
  imports: [ProjectsModule, UserProfilesModule],
  controllers: [SearchController],
  providers: [SearchService],
  exports: [SearchService],
})
export class SearchModule {}
