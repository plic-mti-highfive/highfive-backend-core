import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
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
    @Param('projectId') projectId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: CreateTicketDto,
  ) {
    return this.ticketsService.create(tenantId, projectId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List tickets for a project' })
  findAll(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
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
    @Param('projectId') projectId: string,
    @Param('ticketId') ticketId: string,
  ) {
    return this.ticketsService.findById(tenantId, projectId, ticketId);
  }

  @Patch(':ticketId')
  @ApiOperation({ summary: 'Update ticket (OWNER/ADMIN/MEMBER)' })
  update(
    @TenantId() tenantId: string,
    @Param('projectId') projectId: string,
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
}
