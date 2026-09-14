import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, CurrentUser } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import { parseInteger, parseString } from '../../common/http/query.js';
import {
  reportCreateInputSchema,
  type AdminStats,
  type CurrentUser as CurrentUserDto,
  type Paginated,
  type ProjectSummary,
  type Report,
  type ReportCreateInput,
  type ReportSummary,
  type Tag,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { AdminService } from './admin.service.js';

/** Un motif est facultatif, mais il est journalise quand il est donne (R-S4). */
const reasonBodySchema = z.object({
  reason: z.string().max(1000).optional(),
});

@Controller()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  /**
   * Hors contrat front (ecart connu n°6 de SPEC.md) : sans creation de
   * signalement, la file de moderation ne peut rien contenir.
   */
  @Post('reports')
  @HttpCode(201)
  createReport(
    @CurrentUser() user: UserEntity,
    @ZodBody(reportCreateInputSchema) input: ReportCreateInput,
  ): Promise<Report> {
    return this.admin.createReport(user, input);
  }

  @AdminOnly()
  @Get('admin/reports')
  listReports(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Paginated<ReportSummary>> {
    return this.admin.listReports(parseString(cursor), parseInteger(limit));
  }

  @AdminOnly()
  @Post('admin/reports/:reportId/resolve')
  @HttpCode(200)
  resolveReport(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(reasonBodySchema) body: { reason?: string },
  ): Promise<Report> {
    return this.admin.resolveReport(user, reportId, body.reason);
  }

  @AdminOnly()
  @Post('admin/reports/:reportId/reject')
  @HttpCode(200)
  rejectReport(
    @Param('reportId', ParseUUIDPipe) reportId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(reasonBodySchema) body: { reason?: string },
  ): Promise<Report> {
    return this.admin.rejectReport(user, reportId, body.reason);
  }

  @AdminOnly()
  @Get('admin/stats')
  stats(): Promise<AdminStats> {
    return this.admin.stats();
  }

  @AdminOnly()
  @Get('admin/users')
  listUsers(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Paginated<CurrentUserDto>> {
    return this.admin.listUsers(parseString(cursor), parseInteger(limit));
  }

  @AdminOnly()
  @Post('admin/users/:userId/suspend')
  @HttpCode(204)
  suspend(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(reasonBodySchema) body: { reason?: string },
  ): Promise<void> {
    return this.admin.suspendUser(user, userId, body.reason);
  }

  @AdminOnly()
  @Post('admin/users/:userId/reactivate')
  @HttpCode(204)
  reactivate(
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(reasonBodySchema) body: { reason?: string },
  ): Promise<void> {
    return this.admin.reactivateUser(user, userId, body.reason);
  }

  @AdminOnly()
  @Get('admin/projects')
  listProjects(
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Paginated<ProjectSummary>> {
    return this.admin.listProjects(parseString(cursor), parseInteger(limit));
  }

  @AdminOnly()
  @Delete('admin/projects/:slug')
  @HttpCode(204)
  deleteProject(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.admin.deleteProject(user, slug, undefined);
  }

  @AdminOnly()
  @Get('admin/tags')
  listTags(): Promise<Tag[]> {
    return this.admin.listTags();
  }
}
