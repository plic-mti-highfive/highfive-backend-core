import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  parseInteger,
  parseList,
  parseString,
} from '../../common/http/query.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  idSchema,
  projectCreateInputSchema,
  projectTransitionSchema,
  projectUpdateInputSchema,
  type Paginated,
  type Project,
  type ProjectCreateInput,
  type ProjectSummary,
  type ProjectUpdateInput,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { ProjectsService } from './projects.service.js';

const transitionBodySchema = z.object({
  transition: projectTransitionSchema,
});

const transferBodySchema = z.object({ newOwnerId: idSchema });

/** R-PR7 : la suppression se confirme en retapant le titre exact. */
const deleteBodySchema = z.object({ confirmTitle: z.string() });

@Controller()
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Public()
  @Get('projects')
  list(
    @Query('q') q?: string,
    @Query('tags') tags?: string,
    @Query('participation') participation?: string,
    @Query('sort') sort?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Paginated<ProjectSummary>> {
    return this.projects.listPublic({
      q: parseString(q),
      tags: parseList(tags),
      participation: parseString(participation),
      sort: parseString(sort) as 'recent' | 'popular' | 'relevant' | undefined,
      cursor: parseString(cursor),
      limit: parseInteger(limit),
    });
  }

  @Get('me/projects')
  listMine(@CurrentUser() user: UserEntity): Promise<ProjectSummary[]> {
    return this.projects.listMine(user.id);
  }

  @Public()
  @Get('projects/:slug')
  get(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<Project> {
    return this.projects.getBySlug(slug, user);
  }

  @Post('projects')
  @HttpCode(201)
  create(
    @CurrentUser() user: UserEntity,
    @ZodBody(projectCreateInputSchema) input: ProjectCreateInput,
  ): Promise<Project> {
    return this.projects.create(user, input);
  }

  @Patch('projects/:slug')
  update(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(projectUpdateInputSchema) input: ProjectUpdateInput,
  ): Promise<Project> {
    return this.projects.update(slug, user, input);
  }

  @Post('projects/:slug/transition')
  @HttpCode(200)
  transition(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(transitionBodySchema) body: { transition: string },
  ): Promise<Project> {
    return this.projects.transition(
      slug,
      user,
      body.transition as Parameters<ProjectsService['transition']>[2],
    );
  }

  @Post('projects/:slug/transfer')
  @HttpCode(200)
  transfer(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(transferBodySchema) body: { newOwnerId: string },
  ): Promise<Project> {
    return this.projects.transfer(slug, user, body.newOwnerId);
  }

  /**
   * Le corps d'un DELETE n'est pas garanti par tous les intermediaires : il
   * est lu ici de facon defensive, puis valide comme n'importe quel corps.
   */
  @Delete('projects/:slug')
  @HttpCode(204)
  async remove(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const parsed = deleteBodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw ApiError.validation(
        'Retape le titre exact du projet pour confirmer la suppression.',
        parsed.error.issues,
      );
    }
    await this.projects.remove(slug, user, parsed.data.confirmTitle);
  }
}
