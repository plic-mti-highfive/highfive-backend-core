import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiSecurity,
  ApiOperation,
} from '@nestjs/swagger';
import { SearchService } from './search.service.js';
import { GlobalSearchDto } from './dto/global-search.dto.js';
import { GlobalSearchResponseDto } from './dto/global-search-response.dto.js';
import { TenantId } from '../tenant/tenant.decorator.js';

@ApiTags('Global Search')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get()
  @ApiOperation({
    summary: 'Global search across projects, users, progress, and tags',
  })
  globalSearch(
    @TenantId() tenantId: string,
    @Query() dto: GlobalSearchDto,
  ): Promise<GlobalSearchResponseDto> {
    return this.searchService.searchGlobal(tenantId, dto);
  }
}
