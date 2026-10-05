import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ProjectEntity,
  UserEntity,
  WallChatMessageEntity,
  WallEntity,
} from '../../entities/index.js';
import { CanvasClientService } from '../wall/canvas-client.service.js';
import { AssistantService } from './assistant/assistant.service.js';
import { LlmService } from './assistant/llm.service.js';
import { CanvasChatConsumer } from './canvas-chat.consumer.js';
import { CANVAS_EVENTS_QUEUE } from './wall-chat.constants.js';
import { WallChatRepository } from './wall-chat.repository.js';
import { TypeormWallChatRepository } from './typeorm-wall-chat.repository.js';

/**
 * Chat du Mur : consommateur de `canvas_events` + assistant LLM. Le stockage
 * est derriere `WallChatRepository`, a rebrancher sur la messagerie.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      WallChatMessageEntity,
      WallEntity,
      ProjectEntity,
      UserEntity,
    ]),
    BullModule.registerQueue({ name: CANVAS_EVENTS_QUEUE }),
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
