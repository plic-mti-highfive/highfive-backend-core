import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import { parseString } from '../../common/http/query.js';
import {
  columnCreateInputSchema,
  taskCreateInputSchema,
  taskMoveInputSchema,
  taskUpdateInputSchema,
  type Column as ColumnDto,
  type ColumnCreateInput,
  type Task,
  type TaskCreateInput,
  type TaskMoveInput,
  type TaskUpdateInput,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { TasksService } from './tasks.service.js';

@Controller()
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Public()
  @Get('projects/:slug/columns')
  listColumns(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<ColumnDto[]> {
    return this.tasks.listColumns(slug, user);
  }

  @Post('projects/:slug/columns')
  @HttpCode(201)
  createColumn(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(columnCreateInputSchema) input: ColumnCreateInput,
  ): Promise<ColumnDto> {
    return this.tasks.createColumn(slug, user, input);
  }

  /** `moveTo` est obligatoire : une colonne ne se supprime jamais avec ses taches. */
  @Delete('columns/:columnId')
  @HttpCode(204)
  removeColumn(
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @CurrentUser() user: UserEntity,
    @Query('moveTo') moveTo?: string,
  ): Promise<void> {
    return this.tasks.removeColumn(user, columnId, parseString(moveTo));
  }

  @Public()
  @Get('projects/:slug/tasks')
  listTasks(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<Task[]> {
    return this.tasks.listTasks(slug, user);
  }

  @Post('tasks')
  @HttpCode(201)
  createTask(
    @CurrentUser() user: UserEntity,
    @ZodBody(taskCreateInputSchema) input: TaskCreateInput,
  ): Promise<Task> {
    return this.tasks.createTask(user, input);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(taskUpdateInputSchema) input: TaskUpdateInput,
  ): Promise<Task> {
    return this.tasks.updateTask(user, taskId, input);
  }

  @Post('tasks/:taskId/move')
  @HttpCode(200)
  moveTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(taskMoveInputSchema) input: TaskMoveInput,
  ): Promise<Task> {
    return this.tasks.moveTask(user, taskId, input);
  }

  @Delete('tasks/:taskId')
  @HttpCode(204)
  removeTask(
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.tasks.removeTask(user, taskId);
  }
}
