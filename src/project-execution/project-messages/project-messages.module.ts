import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectMessage } from './entities/project-message.entity.js';
import { ProjectMessagesService } from './project-messages.service.js';
import { ProjectMessagesController } from './project-messages.controller.js';
import { ProjectMembersModule } from '../project-members/project-members.module.js';

@Module({
  imports: [TypeOrmModule.forFeature([ProjectMessage]), ProjectMembersModule],
  controllers: [ProjectMessagesController],
  providers: [ProjectMessagesService],
  exports: [ProjectMessagesService],
})
export class ProjectMessagesModule {}
