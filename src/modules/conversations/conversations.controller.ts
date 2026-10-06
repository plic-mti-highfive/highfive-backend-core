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
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  conversationCreateInputSchema,
  conversationParticipantsAddInputSchema,
  conversationUpdateInputSchema,
  type Conversation,
  type ConversationCreateInput,
  type ConversationDetail,
  type ConversationParticipantsAddInput,
  type ConversationSummary,
  type ConversationUpdateInput,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { ConversationsService } from './conversations.service.js';
import { GroupsService } from './groups.service.js';

/** Les routes des messages sont dans `MessagesController`. */
@Controller()
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly groups: GroupsService,
  ) {}

  @Get('conversations')
  list(@CurrentUser() user: UserEntity): Promise<ConversationSummary[]> {
    return this.conversations.list(user);
  }

  /** Ouvrir des conversations en rafale, c'est le geste du spam. */
  @Post('conversations')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  create(
    @CurrentUser() user: UserEntity,
    @ZodBody(conversationCreateInputSchema) input: ConversationCreateInput,
  ): Promise<Conversation> {
    return this.conversations.create(user, input);
  }

  @Get('conversations/:conversationId')
  detail(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<ConversationDetail> {
    return this.conversations.detail(user, conversationId);
  }

  // R-MSG9 : gestion d'un groupe.

  @Patch('conversations/:conversationId')
  rename(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(conversationUpdateInputSchema) input: ConversationUpdateInput,
  ): Promise<ConversationDetail> {
    return this.groups.rename(user, conversationId, input);
  }

  @Post('conversations/:conversationId/participants')
  @HttpCode(200)
  addParticipants(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(conversationParticipantsAddInputSchema)
    input: ConversationParticipantsAddInput,
  ): Promise<ConversationDetail> {
    return this.groups.addParticipants(user, conversationId, input);
  }

  @Delete('conversations/:conversationId/participants/:userId')
  @HttpCode(204)
  removeParticipant(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.groups.removeParticipant(user, conversationId, userId);
  }

  @Post('conversations/:conversationId/leave')
  @HttpCode(204)
  leave(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.groups.leave(user, conversationId);
  }
}
