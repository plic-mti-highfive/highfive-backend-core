import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ColumnEntity,
  CommentEntity,
  ConversationEntity,
  ConversationParticipantEntity,
  NotificationEntity,
  NotificationPreferenceEntity,
  ProjectEntity,
  TaskEntity,
  UserEntity,
} from '../../entities/index.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * Global : presque tous les domaines notifient, et les faire tous importer ce
 * module n'apporterait rien qu'un graphe de dependances plus touffu.
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEntity,
      NotificationPreferenceEntity,
      UserEntity,
      ProjectEntity,
      TaskEntity,
      ColumnEntity,
      CommentEntity,
      ConversationEntity,
      ConversationParticipantEntity,
    ]),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
