import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  InvitationEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, InvitationEntity, UserEntity]),
    ConversationsModule,
  ],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
