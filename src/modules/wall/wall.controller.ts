import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  acceptSuggestedTasksInputSchema,
  wallToTasksInputSchema,
  type AcceptSuggestedTasksInput,
  type Task,
  type Wall,
  type WallToTasksInput,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import {
  WallService,
  type WallSession,
  type WallSuggestions,
} from './wall.service.js';

@Controller('projects/:slug/wall')
export class WallController {
  constructor(private readonly wall: WallService) {}

  /** `GET /api/projects/:slug/wall` — metadonnees du Mur (R-W1). */
  @Get()
  get(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<Wall> {
    return this.wall.get(slug, user);
  }

  /** `POST /api/projects/:slug/wall/to-tasks` — R-W2. */
  @Post('to-tasks')
  @HttpCode(201)
  toTasks(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(wallToTasksInputSchema) input: WallToTasksInput,
  ): Promise<Task[]> {
    return this.wall.convertToTasks(slug, user, input);
  }

  /**
   * Jeton d'acces au document collaboratif (`WallSession`, contrat front) :
   * le service canvas n'est joignable que par ce biais.
   */
  @Get('session')
  openSession(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<WallSession> {
    return this.wall.openSession(slug, user);
  }

  /** Propositions de taches deduites du Mur par l'IA (rien n'est persiste). */
  @Post('suggest-tasks')
  @HttpCode(200)
  suggestTasks(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<WallSuggestions> {
    return this.wall.suggestTasks(slug, user);
  }

  /** Creation des taches retenues parmi les propositions de l'IA. */
  @Post('suggested-tasks')
  @HttpCode(201)
  acceptSuggestedTasks(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(acceptSuggestedTasksInputSchema) body: AcceptSuggestedTasksInput,
  ): Promise<Task[]> {
    return this.wall.acceptSuggestedTasks(slug, user, body.tasks);
  }
}
