import {
  Controller,
  Get,
  Post,
  Delete,
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
import { SkillsService } from './skills.service.js';
import { CreateSkillDto } from './dto/create-skill.dto.js';
import { TenantId } from '../../shared/tenant/tenant.decorator.js';

@ApiTags('Skills')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller()
export class SkillsController {
  constructor(private readonly skillsService: SkillsService) {}

  @Get('skills')
  @ApiOperation({ summary: 'List all skills for the tenant' })
  findAll(@TenantId() tenantId: string) {
    return this.skillsService.findAll(tenantId);
  }

  @Post('skills')
  @ApiOperation({ summary: 'Create a skill' })
  create(@TenantId() tenantId: string, @Body() dto: CreateSkillDto) {
    return this.skillsService.create(tenantId, dto);
  }

  @Get('users/:userId/skills')
  @ApiOperation({ summary: 'List skills for a user' })
  findUserSkills(
    @TenantId() tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.skillsService.findUserSkills(tenantId, userId);
  }

  @Post('users/:userId/skills/:skillId')
  @ApiOperation({ summary: 'Add skill to user' })
  addSkill(
    @TenantId() tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.skillsService.addSkillToUser(tenantId, userId, skillId);
  }

  @Delete('users/:userId/skills/:skillId')
  @ApiOperation({ summary: 'Remove skill from user' })
  removeSkill(
    @TenantId() tenantId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('skillId') skillId: string,
  ) {
    return this.skillsService.removeSkillFromUser(tenantId, userId, skillId);
  }
}
