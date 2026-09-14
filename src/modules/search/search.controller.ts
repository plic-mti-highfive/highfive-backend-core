import { Controller, Get, Param, Query } from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import {
  parseInteger,
  parseList,
  parseString,
} from '../../common/http/query.js';
import type {
  DiscoverFeed,
  Paginated,
  ProjectSummary,
  SearchEntityType,
  SearchResults,
  SearchSort,
  TrendingTag,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { SearchService } from './search.service.js';

@Controller()
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Public()
  @Get('search')
  find(
    @Query('q') q?: string,
    @Query('types') types?: string,
    @Query('tags') tags?: string,
    @Query('sort') sort?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<SearchResults> {
    return this.search.search({
      q: parseString(q),
      types: parseList(types) as SearchEntityType[] | undefined,
      tags: parseList(tags),
      sort: parseString(sort) as SearchSort | undefined,
      cursor: parseString(cursor),
      limit: parseInteger(limit),
    });
  }

  @Public()
  @Get('feed/discover')
  discover(@CurrentUser() user: UserEntity | undefined): Promise<DiscoverFeed> {
    return this.search.discover(user);
  }

  @Public()
  @Get('feed/tags-trending')
  trending(): Promise<TrendingTag[]> {
    return this.search.trendingTags();
  }

  @Public()
  @Get('tags/:tagId/projects')
  byTag(
    @Param('tagId') tagId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Paginated<ProjectSummary>> {
    return this.search.projectsByTag(
      tagId,
      parseString(cursor),
      parseInteger(limit),
    );
  }
}
