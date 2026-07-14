import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import type { UserContext } from '@plic-mti-highfive/shared-types';
import { TicketsService } from './tickets.service.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { CreateTicketCommentDto } from './dto/create-ticket-comment.dto.js';
import { CreateChecklistItemDto } from './dto/create-checklist-item.dto.js';
import { ToggleChecklistItemDto } from './dto/toggle-checklist-item.dto.js';

@ApiTags('Tickets')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('projects/:projectId/tickets')
export class TicketsController {
  constructor(private readonly ticketsService: TicketsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a ticket (OWNER/ADMIN/MEMBER)' })
  create(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketsService.create(tenantId, projectId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tickets for a project' })
  findAll(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
  ) {
    return this.ticketsService.findByProject(
      tenantId,
      projectId,
      offset,
      limit,
    );
  }

  @Get(':ticketId')
  @ApiOperation({ summary: 'Get ticket by ID' })
  findOne(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId') ticketId: string,
  ) {
    return this.ticketsService.findById(tenantId, projectId, ticketId);
  }

  @Patch(':ticketId')
  @ApiOperation({ summary: 'Update ticket (OWNER/ADMIN/MEMBER)' })
  update(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('ticketId') ticketId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: UpdateTicketDto,
  ) {
    return this.ticketsService.update(
      tenantId,
      projectId,
      ticketId,
      user.id,
      dto,
    );
  }

  // ---------- Checklist and comments management ----------
  @Post(':ticketId/checklists')
  @ApiOperation({ summary: 'Add checklist item to ticket' })
  addChecklistItem(
    @TenantId() tenantId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: CreateChecklistItemDto,
  ) {
    return this.ticketsService.addChecklistItem(
      tenantId,
      ticketId,
      user.id,
      dto,
    );
  }

  @Patch('checklists/:itemId')
  @ApiOperation({ summary: 'Toggle checklist item completion' })
  toggleChecklistItem(
    @TenantId() tenantId: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: ToggleChecklistItemDto,
  ) {
    return this.ticketsService.toggleChecklistItem(
      tenantId,
      itemId,
      dto.isCompleted,
    );
  }

  @Post(':ticketId/comments')
  @ApiOperation({ summary: 'Add comment to ticket' })
  addComment(
    @TenantId() tenantId: string,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: CreateTicketCommentDto,
  ) {
    return this.ticketsService.addComment(tenantId, ticketId, user.id, dto);
  }
}
