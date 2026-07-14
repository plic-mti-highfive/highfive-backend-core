import { Injectable } from '@nestjs/common';
import { GlobalSearchDto } from './dto/global-search.dto.js';
import { SearchEntityType } from '@plic-mti-highfive/shared-types';
import { ProjectsService } from '../../project-execution/projects/projects.service.js';
import { UserProfilesService } from '../../identity/user-profiles/user-profiles.service.js';
import { DataSource } from 'typeorm';

@Injectable()
export class SearchService {
  constructor(
    private readonly projectsService: ProjectsService,
    private readonly userProfilesService: UserProfilesService,
    private readonly dataSource: DataSource,
  ) {}

  async searchGlobal(tenantId: string, dto: GlobalSearchDto) {
    const typesToSearch = dto.types?.length
      ? dto.types
      : Object.values(SearchEntityType);

    const results: Record<string, any> = {};
    const promises: Promise<void>[] = [];

    if (typesToSearch.includes(SearchEntityType.PROJECTS)) {
      promises.push(
        this.projectsService
          .findAll(tenantId, {
            search: dto.search,
            tags: dto.tags,
            sortBy: dto.sortBy,
            sortOrder: dto.sortOrder,
            limit: dto.limit,
            offset: dto.offset,
          })
          .then((res) => {
            results.projects = res;
          }),
      );
    }

    if (typesToSearch.includes(SearchEntityType.USERS)) {
      promises.push(
        this.userProfilesService
          .findAll(tenantId, {
            search: dto.search,
            tags: dto.tags,
            sortBy: dto.sortBy,
            sortOrder: dto.sortOrder,
            limit: dto.limit,
            offset: dto.offset,
          })
          .then((res) => {
            results.users = res;
          }),
      );
    }

    // TODO
    if (typesToSearch.includes(SearchEntityType.PROGRESS)) {
      results.progress = { data: [], total: 0 };
    }

    // TODO
    if (typesToSearch.includes(SearchEntityType.TAGS)) {
      results.tags = { data: [], total: 0 };
    }

    await Promise.all(promises);

    return results;
  }
}
