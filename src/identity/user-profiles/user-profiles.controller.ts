import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ForbiddenException,
  ParseUUIDPipe,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiSecurity,
} from '@nestjs/swagger';
import type { UserContext } from '@plic-mti-highfive/shared-types';
import { UserProfilesService } from './user-profiles.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UserProfileResponseDto } from './dto/user-profile-response.dto.js';
import { UserProjectsResponseDto } from './dto/user-projects-response.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';
import { QueryProfileDto } from './dto/query-profile.dto.js';

@ApiTags('User Profiles')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('users')
export class UserProfilesController {
  constructor(private readonly profilesService: UserProfilesService) {}

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get user profile' })
  findOne(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserProfileResponseDto> {
    return this.profilesService.getEnrichedProfile(tenantId, id);
  }

  @Get(':id/projects')
  @ApiOperation({
    summary: 'Get user projects (created, collaborations, liked)',
  })
  getUserProjects(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<UserProjectsResponseDto> {
    return this.profilesService.getUserProjects(tenantId, id);
  }

  @Patch(':id/profile')
  @ApiOperation({ summary: 'Update own profile' })
  update(
    @TenantId() tenantId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: UserContext,
  ) {
    if (user.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.profilesService.update(tenantId, id, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List user profiles (with filters, sorting and pagination)',
  })
  findAll(@TenantId() tenantId: string, @Query() query: QueryProfileDto) {
    return this.profilesService.findAll(tenantId, query);
  }

  @Get('skills-suggestions')
  @ApiOperation({ summary: 'Récupère la liste de tous les tags existants' })
  getSkillSuggestions(@TenantId() tenantId: string) {
    return this.profilesService.getSkillSuggestions(tenantId);
  }
}
