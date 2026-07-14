import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiSecurity,
  ApiOperation,
} from '@nestjs/swagger';
import { CanvasService } from './canvas.service.js';
import {
  AcceptTasksDto,
  CanvasSessionDto,
  GenerateTasksResponseDto,
} from './dto/canvas.dto.js';
import { TenantId } from '../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../shared/decorators/current-user.decorator.js';
import type { AuthUser } from '../shared/auth/authenticated-user.interface.js';
import { Ticket } from '../project-execution/tickets/entities/ticket.entity.js';

@ApiTags('Canvas')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('projects/:projectId/canvas')
export class CanvasController {
  constructor(private readonly canvasService: CanvasService) {}

  @Get()
  @ApiOperation({
    summary: 'Ouvre une session canvas (cree le canvas au premier acces)',
  })
  openSession(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<CanvasSessionDto> {
    return this.canvasService.openSession(tenantId, projectId, user.id);
  }

  @Post(':canvasId/generate-tasks')
  @ApiOperation({
    summary:
      'Propose des taches a partir du canvas et du projet (rien n est persiste)',
  })
  generateTasks(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('canvasId', ParseUUIDPipe) canvasId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<GenerateTasksResponseDto> {
    return this.canvasService.generateTasks(
      tenantId,
      projectId,
      canvasId,
      user.id,
    );
  }

  @Post(':canvasId/tasks')
  @ApiOperation({
    summary: 'Cree les tickets a partir des taches retenues par l utilisateur',
  })
  acceptTasks(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('canvasId', ParseUUIDPipe) canvasId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptTasksDto,
  ): Promise<Ticket[]> {
    return this.canvasService.acceptTasks(
      tenantId,
      projectId,
      canvasId,
      user.id,
      dto.tasks,
    );
  }
}
