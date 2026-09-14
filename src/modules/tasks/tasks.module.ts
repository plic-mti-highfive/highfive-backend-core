import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  ColumnEntity,
  MembershipEntity,
  TaskEntity,
  UserEntity,
} from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ColumnEntity,
      TaskEntity,
      UserEntity,
      MembershipEntity,
    ]),
    ProjectsModule,
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}
