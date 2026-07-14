import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from './entities/ticket.entity.js';
import { TicketsService } from './tickets.service.js';
import { TicketsController } from './tickets.controller.js';
import { ProjectMembersModule } from '../project-members/project-members.module.js';
import { UsersModule } from '../../identity/users/users.module.js';
import { TicketComment } from './entities/ticket-comment.entity.js';
import { ChecklistItem } from './entities/checklist-item.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ticket, ChecklistItem, TicketComment]),
    ProjectMembersModule,
    UsersModule,
  ],
  controllers: [TicketsController],
  providers: [TicketsService],
  exports: [TicketsService],
})
export class TicketsModule {}
