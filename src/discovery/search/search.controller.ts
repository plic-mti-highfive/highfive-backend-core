import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { SearchService } from './search.service.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';

// NOTE: boilerplate — single GET /search endpoint backed by ILIKE.
@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({ summary: 'Global search across projects, users, tags' })
  search(
    @TenantId() tenantId: string,
    @Query('q') q: string,
    @Query('limit') limit?: number,
  ) {
    return this.searchService.search(tenantId, q, limit);
  }
}
