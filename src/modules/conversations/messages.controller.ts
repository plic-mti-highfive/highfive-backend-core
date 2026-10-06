import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/decorators.js';
import { parseString } from '../../common/http/query.js';
import {
  requireFile,
  type UploadedFile as Upload,
} from '../../common/http/upload.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  messageBodyUpdateInputSchema,
  messageCreateInputSchema,
  type MessageBodyUpdateInput,
  type MessageCreateInput,
  type MessageUpload,
  type MessageWithAuthor,
  type Paginated,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { MessageAttachmentsService } from './message-attachments.service.js';
import { MessagesService } from './messages.service.js';

/**
 * Plafond de lecture du corps multipart : le plus grand des plafonds par
 * famille (video, 50 Mo). Le plafond propre au type reel est verifie ensuite,
 * une fois le contenu inspecte ; celui-ci evite seulement de charger en
 * memoire un envoi sans commune mesure.
 */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

@Controller()
export class MessagesController {
  constructor(
    private readonly messages: MessagesService,
    private readonly attachments: MessageAttachmentsService,
  ) {}

  @Get('conversations/:conversationId/messages')
  list(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
    @Query('cursor') cursor?: string,
  ): Promise<Paginated<MessageWithAuthor>> {
    return this.messages.list(user, conversationId, parseString(cursor));
  }

  /** Une minute pour 60 messages : large pour une personne, pas pour un script. */
  @Post('conversations/:conversationId/messages')
  @HttpCode(201)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  send(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(messageCreateInputSchema) input: MessageCreateInput,
  ): Promise<MessageWithAuthor> {
    return this.messages.send(user, conversationId, input);
  }

  /** R-MSG8 : premier temps du depot ; le message suivant joint l'`id`. */
  @Post('conversations/:conversationId/attachments')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES + 1 } }),
  )
  upload(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
    @UploadedFile() file?: Upload,
  ): Promise<MessageUpload> {
    return this.attachments.upload(user, conversationId, requireFile(file));
  }

  @Post('conversations/:conversationId/read')
  @HttpCode(204)
  markRead(
    @Param('conversationId', ParseUUIDPipe) conversationId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.messages.markRead(user, conversationId);
  }

  @Patch('messages/:messageId')
  edit(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(messageBodyUpdateInputSchema) input: MessageBodyUpdateInput,
  ): Promise<MessageWithAuthor> {
    return this.messages.edit(user, messageId, input.body);
  }

  @Delete('messages/:messageId')
  @HttpCode(204)
  remove(
    @Param('messageId', ParseUUIDPipe) messageId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.messages.remove(user, messageId);
  }
}
