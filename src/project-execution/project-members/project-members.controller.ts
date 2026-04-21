import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import type { UserContext } from '@plic-mti-highfive/shared-types';
import { ProjectMembersService } from './project-members.service.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

@ApiTags('Project Members')
@ApiBearerAuth()
@Controller('projects/:projectId/members')
export class ProjectMembersController {
  constructor(private readonly membersService: ProjectMembersService) {}

  @Get()
  @ApiOperation({ summary: 'List project members' })
  findAll(@TenantId() tenantId: string, @Param('projectId') projectId: string) {
    return this.membersService.findMembers(tenantId, projectId);
  }

  @Post()
  @ApiOperation({ summary: 'Add member to project (OWNER/ADMIN)' })
  add(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: AddMemberDto,
  ) {
    return this.membersService.addMember(tenantId, projectId, user.id, dto);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Update member role (OWNER/ADMIN)' })
  updateRole(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: UpdateMemberRoleDto,
  ) {
    return this.membersService.updateRole(
      tenantId,
      projectId,
      user.id,
      userId,
      dto,
    );
  }

  @Delete(':userId')
  @ApiOperation({ summary: 'Remove member from project (OWNER/ADMIN)' })
  remove(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
    @Param('userId') userId: string,
    @CurrentUser() user: UserContext,
  ) {
    return this.membersService.removeMember(
      tenantId,
      projectId,
      user.id,
      userId,
    );
  }
}
