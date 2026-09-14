import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WallEntity } from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TasksModule } from '../tasks/tasks.module.js';
import { AiTasksService } from './ai-tasks.service.js';
import { CanvasClientService } from './canvas-client.service.js';
import { WallController } from './wall.controller.js';
import { WallService } from './wall.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([WallEntity]),
    JwtModule.register({}),
    ProjectsModule,
    TasksModule,
  ],
  controllers: [WallController],
  providers: [WallService, CanvasClientService, AiTasksService],
  exports: [WallService],
})
export class WallModule {}
