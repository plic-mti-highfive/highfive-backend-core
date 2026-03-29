import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  ForbiddenException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { UserProfilesService } from './user-profiles.service.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';
import { CurrentUser } from '../../shared/decorators/current-user.decorator.js';

@ApiTags('User Profiles')
@ApiBearerAuth()
@Controller('users')
export class UserProfilesController {
  constructor(private readonly profilesService: UserProfilesService) {}

  @Get(':id/profile')
  @ApiOperation({ summary: 'Get user profile' })
  findOne(@TenantId() tenantId: string, @Param('id') id: string) {
    return this.profilesService.findByUserId(tenantId, id);
  }

  @Patch(':id/profile')
  @ApiOperation({ summary: 'Update own profile' })
  update(
    @TenantId() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateProfileDto,
    @CurrentUser() user: any,
  ) {
    if (user.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.profilesService.update(tenantId, id, dto);
  }
}
