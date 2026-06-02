import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  ParseIntPipe,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';

import { AdminService } from './admin.service.js';
import { UpdateUserStatusDto } from './dto/update-user-status.dto.js';
import { UpdateUserRoleDto } from './dto/update-user-role.dto.js';
import {
  AdminProjectDto,
  AdminStatsDto,
  AdminTenantDto,
  AdminUserDto,
  DailyRegistrationDto,
  RecentlyClosedProjectDto,
} from './dto/admin-response.dto.js';
import { TenantId } from '../shared/tenant/tenant.decorator.js';
import { SystemRoles } from '../shared/decorators/system-roles.decorator.js';
import { SystemRole } from '../shared/auth/system-role.enum.js';

/**
 * Endpoints du dashboard admin plateforme. Réservés au rôle `ADMIN`
 * (via `SystemRolesGuard` + `@SystemRoles`). L'authentification JWT et le
 * contexte tenant sont assurés globalement.
 */
@ApiTags('Admin')
@ApiBearerAuth()
@SystemRoles(SystemRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('stats')
  @ApiOperation({ summary: 'Statistiques globales du tenant' })
  getStats(@TenantId() tenantId: string): Promise<AdminStatsDto> {
    return this.adminService.getStats(tenantId);
  }

  @Get('stats/registrations')
  @ApiOperation({ summary: 'Inscriptions journalières (fenêtre glissante)' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  getRegistrations(
    @TenantId() tenantId: string,
    @Query('days', new ParseIntPipe({ optional: true })) days?: number,
  ): Promise<DailyRegistrationDto[]> {
    return this.adminService.getDailyRegistrations(tenantId, days ?? 30);
  }

  @Get('users')
  @ApiOperation({ summary: 'Liste des utilisateurs du tenant' })
  getUsers(@TenantId() tenantId: string): Promise<AdminUserDto[]> {
    return this.adminService.getUsers(tenantId);
  }

  @Patch('users/:id/status')
  @ApiOperation({ summary: "Modifier le statut d'un utilisateur" })
  updateUserStatus(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserStatusDto,
  ): Promise<AdminUserDto> {
    return this.adminService.updateUserStatus(tenantId, id, dto.status);
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: "Modifier le rôle plateforme d'un utilisateur" })
  updateUserRole(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserRoleDto,
  ): Promise<AdminUserDto> {
    return this.adminService.updateUserRole(tenantId, id, dto.role);
  }

  @Delete('users/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer (soft delete) un utilisateur' })
  async deleteUser(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.adminService.deleteUser(tenantId, id);
  }

  @Get('projects')
  @ApiOperation({ summary: 'Liste des projets du tenant' })
  getProjects(@TenantId() tenantId: string): Promise<AdminProjectDto[]> {
    return this.adminService.getProjects(tenantId);
  }

  @Get('projects/recently-closed')
  @ApiOperation({ summary: 'Projets récemment archivés' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getRecentlyClosed(
    @TenantId() tenantId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ): Promise<RecentlyClosedProjectDto[]> {
    return this.adminService.getRecentlyClosedProjects(tenantId, limit ?? 5);
  }

  @Patch('projects/:id/archive')
  @ApiOperation({ summary: 'Basculer un projet entre actif et archivé' })
  toggleArchive(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdminProjectDto> {
    return this.adminService.toggleArchiveProject(tenantId, id);
  }

  @Delete('projects/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Supprimer (soft delete) un projet' })
  async deleteProject(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.adminService.deleteProject(tenantId, id);
  }

  @Get('tenants')
  @ApiOperation({ summary: 'Liste des organisations (tenants)' })
  getTenants(): Promise<AdminTenantDto[]> {
    return this.adminService.getTenants();
  }
}
