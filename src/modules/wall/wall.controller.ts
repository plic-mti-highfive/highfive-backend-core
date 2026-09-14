import { Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  wallToTasksInputSchema,
  type Task,
  type Wall,
  type WallToTasksInput,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import type { ProposedTask } from './canvas.types.js';
import {
  WallService,
  type WallSession,
  type WallSuggestions,
} from './wall.service.js';

const proposedTaskSchema = z.object({
  title: z.string().min(1).max(120),
  description: z.string().max(1000).default(''),
  sourceHints: z.array(z.string()).default([]),
});

const acceptSuggestionsSchema = z.object({
  tasks: z.array(proposedTaskSchema).min(1).max(50),
});

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
   * Hors contrat front : jeton d'acces au document collaboratif. Conservee
   * parce que le service canvas n'est joignable que par ce biais.
   */
  @Get('session')
  openSession(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<WallSession> {
    return this.wall.openSession(slug, user);
  }

  /** Hors contrat front : propositions de taches deduites du Mur (rien n'est persiste). */
  @Post('suggest-tasks')
  @HttpCode(200)
  suggestTasks(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
  ): Promise<WallSuggestions> {
    return this.wall.suggestTasks(slug, user);
  }

  /** Hors contrat front : creation des taches retenues parmi les propositions. */
  @Post('suggested-tasks')
  @HttpCode(201)
  acceptSuggestedTasks(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(acceptSuggestionsSchema) body: { tasks: ProposedTask[] },
  ): Promise<Task[]> {
    return this.wall.acceptSuggestedTasks(slug, user, body.tasks);
  }
}
