import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import type { UserContext } from '@plic-mti-highfive/shared-types';
import { UserConnectionsService } from './user-connections.service.js';
import { CreateConnectionDto } from './dto/create-connection.dto.js';
import { UpdateConnectionDto } from './dto/update-connection.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

@ApiTags('Connections')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('connections')
export class UserConnectionsController {
  constructor(private readonly connectionsService: UserConnectionsService) {}

  @Post()
  @ApiOperation({ summary: 'Send connection request' })
  create(
    @TenantId() tenantId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: CreateConnectionDto,
  ) {
    return this.connectionsService.create(tenantId, user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Accept or block connection' })
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: UserContext,
    @Body() dto: UpdateConnectionDto,
  ) {
    return this.connectionsService.update(tenantId, id, user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List accepted connections' })
  findAll(@TenantId() tenantId: string, @CurrentUser() user: UserContext) {
    return this.connectionsService.findAll(tenantId, user.id);
  }

  @Get('pending')
  @ApiOperation({ summary: 'List pending connection requests' })
  findPending(@TenantId() tenantId: string, @CurrentUser() user: UserContext) {
    return this.connectionsService.findPending(tenantId, user.id);
  }
}
