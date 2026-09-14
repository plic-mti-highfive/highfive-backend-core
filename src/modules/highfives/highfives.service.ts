import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type { Paginated, UserSummary } from '../../contracts/index.js';
import {
  HighfiveEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  clampLimit,
  decodeCursor,
  toPage,
} from '../../common/http/pagination.js';
import { toUserSummary } from '../../common/mappers/index.js';
import { AiEventsService } from '../../common/ai/ai-events.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

export interface HighfiveToggleResponse {
  given: boolean;
  highfiveCount: number;
}

@Injectable()
export class HighfivesService {
  constructor(
    @InjectRepository(HighfiveEntity)
    private readonly highfives: Repository<HighfiveEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
    private readonly ai: AiEventsService,
  ) {}

  /**
   * R-H1 : idempotent par construction (cle primaire composite). R-H2 : le
   * porteur ne highfive pas son propre projet — l'encouragement viendrait de
   * lui-meme, ce qui ne veut rien dire.
   */
  async give(slug: string, user: UserEntity): Promise<HighfiveToggleResponse> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, user);

    if (project.ownerId === user.id) {
      throw ApiError.forbidden('On ne highfive pas son propre projet.');
    }

    const alreadyGiven = await this.highfives.findOne({
      where: { projectId: project.id, userId: user.id },
    });

    if (!alreadyGiven) {
      await this.dataSource.transaction(async (manager) => {
        await manager.save(
          manager.create(HighfiveEntity, {
            projectId: project.id,
            userId: user.id,
          }),
        );
        await manager.increment(
          ProjectEntity,
          { id: project.id },
          'highfiveCount',
          1,
        );
      });

      await this.notifications.notify({
        recipientId: project.ownerId,
        actorId: user.id,
        type: 'highfive_received',
        targetType: 'project',
        targetId: project.id,
      });

      await this.ai.userInteracted({
        userId: user.id,
        projectId: project.id,
        kind: 'like',
      });
    }

    return this.state(project.id, user.id);
  }

  /** R-H4 : retirer un highfive ne notifie jamais — ce serait un desaveu public. */
  async withdraw(
    slug: string,
    user: UserEntity,
  ): Promise<HighfiveToggleResponse> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, user);

    const existing = await this.highfives.findOne({
      where: { projectId: project.id, userId: user.id },
    });

    if (existing) {
      await this.dataSource.transaction(async (manager) => {
        await manager.delete(HighfiveEntity, {
          projectId: project.id,
          userId: user.id,
        });
        await manager.decrement(
          ProjectEntity,
          { id: project.id },
          'highfiveCount',
          1,
        );
      });
    }

    return this.state(project.id, user.id);
  }

  /** R-H3 : la liste des personnes qui ont highfive est publique. */
  async list(
    slug: string,
    viewer: UserEntity | undefined,
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<Paginated<UserSummary>> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);

    const offset = decodeCursor(cursor);
    const size = clampLimit(limit);

    const [rows, total] = await this.highfives.findAndCount({
      where: { projectId: project.id },
      order: { givenAt: 'DESC' },
      skip: offset,
      take: size,
    });

    const users = await this.users.find({
      where: { id: In(rows.map((row) => row.userId)) },
    });
    const byId = new Map(users.map((user) => [user.id, user]));

    const items = rows
      .map((row) => byId.get(row.userId))
      .filter((user): user is UserEntity => !!user)
      .map(toUserSummary);

    return toPage(items, total, offset);
  }

  /**
   * Le compteur renvoye est toujours relu en base (R-X2) : le client ne
   * l'incremente jamais lui-meme, et deux onglets ouverts doivent converger.
   */
  private async state(
    projectId: string,
    userId: string,
  ): Promise<HighfiveToggleResponse> {
    const project = await this.access.findByIdOrFail(projectId);
    const given = !!(await this.highfives.findOne({
      where: { projectId, userId },
    }));

    await this.ai.projectStatsChanged({
      projectId,
      highfiveCount: project.highfiveCount,
    });

    return { given, highfiveCount: project.highfiveCount };
  }
}
