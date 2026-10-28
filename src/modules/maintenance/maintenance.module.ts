import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  InvitationEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ConversationsModule } from '../conversations/conversations.module.js';
import { CustomizationModule } from '../customization/customization.module.js';
import { FilesModule } from '../files/files.module.js';
import { MaintenanceService } from './maintenance.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, InvitationEntity, UserEntity]),
    ConversationsModule,
    CustomizationModule,
    FilesModule,
  ],
  providers: [MaintenanceService],
})
export class MaintenanceModule {}
