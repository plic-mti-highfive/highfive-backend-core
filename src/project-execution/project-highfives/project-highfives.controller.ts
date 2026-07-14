import { Controller, Post, Delete, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { UserContext } from '@plic-mti-highfive/shared-types';
import { ProjectHighfivesService } from './project-highfives.service.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

@ApiTags('Project Highfives')
@ApiBearerAuth()
@Controller('projects/:projectId/highfive')
export class ProjectHighfivesController {
  constructor(private readonly highfivesService: ProjectHighfivesService) {}

  @Post()
  @ApiOperation({ summary: 'High-five a project' })
  add(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.highfivesService.add(tenantId, projectId, user.id);
  }

  @Delete()
  @ApiOperation({ summary: 'Remove a high-five from a project' })
  remove(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.highfivesService.remove(tenantId, projectId, user.id);
  }
}
