import {
  Controller,
  Get,
  Post,
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
import { ProjectMessagesService } from './project-messages.service.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

@ApiTags('Project Messages')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('projects/:projectId/messages')
export class ProjectMessagesController {
  constructor(private readonly messagesService: ProjectMessagesService) {}

  @Post()
  @ApiOperation({ summary: 'Send a message in project chat' })
  create(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: CreateMessageDto,
  ) {
    return this.messagesService.create(tenantId, projectId, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List project chat messages' })
  findAll(
    @TenantId() tenantId: string,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('offset') offset?: number,
    @Query('limit') limit?: number,
  ) {
    return this.messagesService.findByProject(
      tenantId,
      projectId,
      offset,
      limit,
    );
  }
}
