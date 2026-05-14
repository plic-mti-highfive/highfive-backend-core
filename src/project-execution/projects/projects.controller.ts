import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { UserContext } from '@plic-mti-highfive/shared-types';
import { ProjectsService } from './projects.service.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { QueryProjectDto } from './dto/query-project.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a project (creator becomes OWNER)' })
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: CreateProjectDto,
  ) {
    return this.projectsService.create(tenantId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List projects (with filters and pagination)' })
  findAll(@TenantId() tenantId: string, @Query() query: QueryProjectDto) {
    return this.projectsService.findAll(tenantId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get project by ID' })
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.projectsService.findById(tenantId, id);
  }

  @Post('/batch')
  @ApiOperation({ summary: 'Get projects by IDs' })
  async getBatchByIds(
    @TenantId() tenantId: string,
    @Body() dto: { ids: string[] },
  ) {
    return this.projectsService.findByIds(tenantId, dto.ids);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update project (OWNER/ADMIN only)' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: UserContext,
    @Body() dto: UpdateProjectDto,
  ) {
    return this.projectsService.update(tenantId, id, user.id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft delete project (OWNER only)' })
  remove(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.projectsService.softDelete(tenantId, id, user.id);
  }

  @Post(':id/like')
  @ApiOperation({ summary: 'Like a project' })
  async likeProject(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: UserContext,
  ) {
    await this.projectsService.likeProject(tenantId, id, user.id);
    return { success: true, message: 'Project liked' };
  }

  @Post(':id/apply')
  @ApiOperation({ summary: 'Apply to a project' })
  async submitApplication(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @CurrentUser() user: UserContext,
  ) {
    await this.projectsService.submitApplication(tenantId, id, user.id);
    return { success: true, message: 'Application submitted' };
  }
}
