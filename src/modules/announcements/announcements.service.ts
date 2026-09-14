import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  Announcement,
  AnnouncementCreateInput,
  UserSummary,
} from '../../contracts/index.js';
import {
  AnnouncementEntity,
  HighfiveEntity,
  MembershipEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { toAnnouncement, toUserSummary } from '../../common/mappers/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';

export interface AnnouncementWithAuthor extends Announcement {
  author: UserSummary;
}

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(AnnouncementEntity)
    private readonly announcements: Repository<AnnouncementEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(HighfiveEntity)
    private readonly highfives: Repository<HighfiveEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(
    slug: string,
    viewer: UserEntity | undefined,
  ): Promise<AnnouncementWithAuthor[]> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);

    const rows = await this.announcements.find({
      where: { projectId: project.id },
      // L'annonce epinglee passe devant, puis de la plus recente a la plus
      // ancienne : c'est l'ordre de lecture attendu sur la fiche.
      order: { pinned: 'DESC', publishedAt: 'DESC' },
    });

    const authors = await this.users.find({
      where: { id: In(rows.map((row) => row.authorId)) },
    });
    const byId = new Map(authors.map((user) => [user.id, user]));

    return rows
      .filter((row) => byId.has(row.authorId))
      .map((row) => ({
        ...toAnnouncement(row),
        author: toUserSummary(byId.get(row.authorId)!),
      }));
  }

  /** R-A1 : publier une annonce revient au porteur et aux co-porteurs. */
  async create(
    slug: string,
    author: UserEntity,
    input: AnnouncementCreateInput,
  ): Promise<Announcement> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, author, 'co_owner');

    const announcement = await this.dataSource.transaction(async (manager) => {
      if (input.pinned) await this.unpinAll(manager, project.id);

      return manager.save(
        manager.create(AnnouncementEntity, {
          projectId: project.id,
          authorId: author.id,
          title: input.title,
          body: input.body,
          pinned: input.pinned ?? false,
        }),
      );
    });

    // R-A3 : l'equipe et les personnes qui ont highfive le projet sont
    // prevenues — ce sont celles qui ont manifeste un interet pour la suite.
    await this.notifications.notifyMany(await this.audienceOf(project.id), {
      actorId: author.id,
      type: 'announcement_on_followed_project',
      targetType: 'project',
      targetId: project.id,
    });

    await this.access.touch(project.id);
    return toAnnouncement(announcement);
  }

  /** R-A2 : une seule annonce epinglee — epingler depingle l'ancienne. */
  async pin(actor: UserEntity, announcementId: string): Promise<Announcement> {
    const announcement = await this.findOrFail(announcementId);
    const project = await this.access.findByIdOrFail(announcement.projectId);
    await this.access.assertRole(project, actor, 'co_owner');

    const updated = await this.dataSource.transaction(async (manager) => {
      await this.unpinAll(manager, project.id);
      await manager.update(
        AnnouncementEntity,
        { id: announcement.id },
        { pinned: true },
      );
      return manager.findOneOrFail(AnnouncementEntity, {
        where: { id: announcement.id },
      });
    });

    return toAnnouncement(updated);
  }

  async remove(actor: UserEntity, announcementId: string): Promise<void> {
    const announcement = await this.findOrFail(announcementId);
    const project = await this.access.findByIdOrFail(announcement.projectId);
    await this.access.assertRole(project, actor, 'co_owner');

    await this.announcements.delete({ id: announcement.id });
  }

  private async unpinAll(
    manager: DataSource['manager'],
    projectId: string,
  ): Promise<void> {
    await manager.update(
      AnnouncementEntity,
      { projectId, pinned: true },
      { pinned: false },
    );
  }

  private async findOrFail(id: string): Promise<AnnouncementEntity> {
    const announcement = await this.announcements.findOne({ where: { id } });
    if (!announcement) throw ApiError.notFound("Cette annonce n'existe pas.");
    return announcement;
  }

  private async audienceOf(projectId: string): Promise<string[]> {
    const [team, supporters] = await Promise.all([
      this.memberships.find({ where: { projectId, blocked: false } }),
      this.highfives.find({ where: { projectId } }),
    ]);
    return [
      ...team.map((row) => row.userId),
      ...supporters.map((row) => row.userId),
    ];
  }
}
