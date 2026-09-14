import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  invitationCreateInputSchema,
  joinRequestCreateInputSchema,
  membershipRoleSchema,
  type Invitation,
  type InvitationCreateInput,
  type JoinRequest,
  type JoinRequestCreateInput,
  type Membership,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { MembershipsService, type TeamMember } from './memberships.service.js';

const roleBodySchema = z.object({ role: membershipRoleSchema });

@Controller()
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Public()
  @Get('projects/:slug/members')
  listMembers(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<TeamMember[]> {
    return this.memberships.listMembers(slug, user);
  }

  @Patch('projects/:slug/members/:userId')
  updateRole(
    @Param('slug') slug: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(roleBodySchema) body: { role: Membership['role'] },
  ): Promise<Membership> {
    return this.memberships.updateRole(slug, user, userId, body.role);
  }

  @Delete('projects/:slug/members/:userId')
  @HttpCode(204)
  removeMember(
    @Param('slug') slug: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.memberships.removeMember(slug, user, userId);
  }

  @Post('projects/:slug/members/:userId/block')
  @HttpCode(204)
  blockMember(
    @Param('slug') slug: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.memberships.blockMember(slug, user, userId);
  }

  @Post('projects/:slug/leave')
  @HttpCode(204)
  leave(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.memberships.leave(slug, user);
  }

  @Get('projects/:slug/join-requests')
  listJoinRequests(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<JoinRequest[]> {
    return this.memberships.listJoinRequests(slug, user);
  }

  @Post('projects/:slug/join-requests')
  @HttpCode(201)
  createJoinRequest(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(joinRequestCreateInputSchema) input: JoinRequestCreateInput,
  ): Promise<JoinRequest> {
    return this.memberships.createJoinRequest(slug, user, input);
  }

  @Post('projects/:slug/join-requests/:requestId/accept')
  @HttpCode(204)
  acceptJoinRequest(
    @Param('slug') slug: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.memberships.acceptJoinRequest(slug, user, requestId);
  }

  @Post('projects/:slug/join-requests/:requestId/reject')
  @HttpCode(204)
  rejectJoinRequest(
    @Param('slug') slug: string,
    @Param('requestId', ParseUUIDPipe) requestId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.memberships.rejectJoinRequest(slug, user, requestId);
  }

  @Get('projects/:slug/invitations')
  listInvitations(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<Invitation[]> {
    return this.memberships.listInvitations(slug, user);
  }

  @Post('projects/:slug/invitations')
  @HttpCode(201)
  createInvitation(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(invitationCreateInputSchema) input: InvitationCreateInput,
  ): Promise<Invitation> {
    return this.memberships.createInvitation(slug, user, input);
  }

  @Post('invitations/:invitationId/accept')
  @HttpCode(204)
  acceptInvitation(
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.memberships.acceptInvitation(user, invitationId);
  }

  @Post('invitations/:invitationId/reject')
  @HttpCode(204)
  rejectInvitation(
    @Param('invitationId', ParseUUIDPipe) invitationId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.memberships.rejectInvitation(user, invitationId);
  }
}
