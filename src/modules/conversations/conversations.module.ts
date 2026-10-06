import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ConversationEntity,
  ConversationParticipantEntity,
  MessageEntity,
  MessageUploadEntity,
  ProjectEntity,
  ProjectFileEntity,
  UserEntity,
} from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { ChannelsService } from './channels.service.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';
import { GroupsService } from './groups.service.js';
import { MessageAttachmentsService } from './message-attachments.service.js';
import { MessagesController } from './messages.controller.js';
import { MessagesService } from './messages.service.js';

/**
 * Messagerie (`/conversations`, `/messages`) : conversations directes,
 * groupes (R-MSG9) et canaux de projet (R-MSG3). Choix et limites :
 * `docs/MESSAGERIE.md`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationEntity,
      ConversationParticipantEntity,
      MessageEntity,
      MessageUploadEntity,
      UserEntity,
      ProjectEntity,
      ProjectFileEntity,
    ]),
    ProjectsModule,
  ],
  controllers: [ConversationsController, MessagesController],
  providers: [
    ConversationsService,
    MessagesService,
    MessageAttachmentsService,
    ChannelsService,
    GroupsService,
  ],
  exports: [
    ConversationsService,
    MessagesService,
    MessageAttachmentsService,
    ChannelsService,
  ],
})
export class ConversationsModule {}
