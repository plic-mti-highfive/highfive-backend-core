import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ProjectEntity,
  ConversationEntity,
  MessageEntity,
  UserEntity,
  WallEntity,
} from '../../entities/index.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { CanvasClientService } from '../wall/canvas-client.service.js';
import { AssistantService } from './assistant/assistant.service.js';
import { LlmService } from './assistant/llm.service.js';
import { CanvasChatConsumer } from './canvas-chat.consumer.js';
import { CANVAS_EVENTS_QUEUE } from './wall-chat.constants.js';
import { WallChatRepository } from './wall-chat.repository.js';
import { TypeormWallChatRepository } from './typeorm-wall-chat.repository.js';

/**
 * Chat du Mur : consommateur de `canvas_events` + assistant LLM. Le stockage
 * est derriere `WallChatRepository`, implemente sur la messagerie
 * (conversation `kind = 'wall'`, voir `ChannelsService`).
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      ConversationEntity,
      MessageEntity,
      WallEntity,
      ProjectEntity,
      UserEntity,
    ]),
    BullModule.registerQueue({ name: CANVAS_EVENTS_QUEUE }),
    ConversationsModule,
  ],
  providers: [
    { provide: WallChatRepository, useClass: TypeormWallChatRepository },
    LlmService,
    AssistantService,
    CanvasClientService,
    CanvasChatConsumer,
  ],
})
export class WallChatModule {}
