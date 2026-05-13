import { Controller, Get, Post, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TagsService } from './tags.service.js';
import { CreateTagDto } from './dto/create-tag.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';

@ApiTags('Tags')
@ApiBearerAuth()
@Controller()
export class TagsController {
  constructor(private readonly tagsService: TagsService) {}

  @Get('tags')
  @ApiOperation({ summary: 'List all tags for the tenant' })
  findAll(@TenantId() tenantId: string) {
    return this.tagsService.findAll(tenantId);
  }

  @Post('tags')
  @ApiOperation({ summary: 'Create a tag' })
  create(@TenantId() tenantId: string, @Body() dto: CreateTagDto) {
    return this.tagsService.create(tenantId, dto);
  }

  @Get('projects/:projectId/tags')
  @ApiOperation({ summary: 'List tags attached to a project' })
  findProjectTags(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
  ) {
    return this.tagsService.findProjectTags(tenantId, projectId);
  }

  @Post('projects/:projectId/tags/:tagId')
  @ApiOperation({ summary: 'Attach a tag to a project' })
  addTag(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagsService.addTagToProject(tenantId, projectId, tagId);
  }

  @Delete('projects/:projectId/tags/:tagId')
  @ApiOperation({ summary: 'Detach a tag from a project' })
  removeTag(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('tagId') tagId: string,
  ) {
    return this.tagsService.removeTagFromProject(tenantId, projectId, tagId);
  }
}
