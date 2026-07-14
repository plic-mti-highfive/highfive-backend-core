import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { Canvas } from './entities/canvas.entity.js';
import { CanvasService } from './canvas.service.js';
import { CanvasController } from './canvas.controller.js';
import { CanvasClientService } from './canvas-client.service.js';
import { AiTasksService } from './ai-tasks.service.js';
import { ProjectsModule } from '../project-execution/projects/projects.module.js';
import { ProjectMembersModule } from '../project-execution/project-members/project-members.module.js';
import { TicketsModule } from '../project-execution/tickets/tickets.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Canvas]),
    JwtModule.register({}),
    ProjectsModule,
    ProjectMembersModule,
    TicketsModule,
  ],
  controllers: [CanvasController],
  providers: [CanvasService, CanvasClientService, AiTasksService],
  exports: [CanvasService],
})
export class CanvasModule {}
