import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import type {
  AdminActionType,
  AdminStats,
  CurrentUser,
  Paginated,
  ProjectSummary,
  Report,
  ReportCreateInput,
  ReportSummary,
  ReportTargetPreview,
  ReportTargetType,
  Tag,
} from '../../contracts/index.js';
import {
  AdminActionEntity,
  CommentEntity,
  ProjectEntity,
  ReportEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  clampLimit,
  decodeCursor,
  toPage,
} from '../../common/http/pagination.js';
import {
  toCurrentUser,
  toReport,
  toUserSummary,
} from '../../common/mappers/index.js';
import { SessionService } from '../../common/auth/session.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { TagsService } from '../tags/tags.service.js';

/** Fenetre au-dela de laquelle on ne considere plus une personne « en ligne ». */
const ONLINE_WINDOW_MS = 15 * 60 * 1000;

/** R-S2 : trois signalements distincts font remonter une cible en tete de file. */
const ESCALATION_THRESHOLD = 3;

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(ReportEntity)
    private readonly reports: Repository<ReportEntity>,
    @InjectRepository(AdminActionEntity)
    private readonly actions: Repository<AdminActionEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(CommentEntity)
    private readonly comments: Repository<CommentEntity>,
    private readonly access: ProjectAccessService,
    private readonly tags: TagsService,
    private readonly notifications: NotificationsService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Creation d'un signalement.
   *
   * Hors contrat front actuel (ecart connu n°6 de SPEC.md : le schema existe,
   * la route n'etait appelee par aucun ecran) — implementee ici parce que sans
   * elle la file de moderation reste vide par construction.
   */
  async createReport(
    reporter: UserEntity,
    input: ReportCreateInput,
  ): Promise<Report> {
    await this.assertTargetExists(input.targetType, input.targetId);

    const existing = await this.reports.findOne({
      where: {
        reporterId: reporter.id,
        targetType: input.targetType,
        targetId: input.targetId,
        status: 'new',
      },
    });
    if (existing) {
      throw ApiError.conflict('Tu as deja signale ce contenu.');
    }

    const report = await this.reports.save(
      this.reports.create({
        reporterId: reporter.id,
        targetType: input.targetType,
        targetId: input.targetId,
        reason: input.reason,
        detail: input.detail ?? null,
        status: 'new',
      }),
    );

    return toReport(report);
  }

  /**
   * R-S2 : la file remonte d'abord les cibles signalees au moins trois fois,
   * puis suit l'ordre chronologique. Ce qui est signale en masse merite d'etre
   * regarde en premier.
   */
  async listReports(
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<Paginated<ReportSummary>> {
    const rows = await this.reports.find({
      where: { status: 'new' },
      order: { createdAt: 'ASC' },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      const key = `${row.targetType}:${row.targetId}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    const ordered = [...rows].sort((a, b) => {
      const countA = counts.get(`${a.targetType}:${a.targetId}`) ?? 1;
      const countB = counts.get(`${b.targetType}:${b.targetId}`) ?? 1;
      const escalatedA = countA >= ESCALATION_THRESHOLD ? 1 : 0;
      const escalatedB = countB >= ESCALATION_THRESHOLD ? 1 : 0;
      return (
        escalatedB - escalatedA || a.createdAt.getTime() - b.createdAt.getTime()
      );
    });

    const offset = decodeCursor(cursor);
    const size = clampLimit(limit);
    const page = ordered.slice(offset, offset + size);

    const reporters = await this.users.find({
      where: { id: In(page.map((row) => row.reporterId)) },
    });
    const byId = new Map(reporters.map((user) => [user.id, user]));

    const items: ReportSummary[] = [];
    for (const row of page) {
      const reporter = byId.get(row.reporterId);
      if (!reporter) continue;

      items.push({
        ...toReport(row),
        reporter: toUserSummary(reporter),
        target: await this.previewTarget(row.targetType, row.targetId),
        similarReportsCount:
          counts.get(`${row.targetType}:${row.targetId}`) ?? 1,
      });
    }

    return toPage(items, ordered.length, offset);
  }

  async resolveReport(
    admin: UserEntity,
    reportId: string,
    reason: string | undefined,
  ): Promise<Report> {
    return this.decideReport(
      admin,
      reportId,
      'handled',
      'resolve_report',
      reason,
    );
  }

  async rejectReport(
    admin: UserEntity,
    reportId: string,
    reason: string | undefined,
  ): Promise<Report> {
    return this.decideReport(
      admin,
      reportId,
      'rejected',
      'reject_report',
      reason,
    );
  }

  async stats(): Promise<AdminStats> {
    const [usersCount, onlineCount, pendingReportsCount] = await Promise.all([
      this.users.count({ where: { deletedAt: IsNull() } }),
      this.users.count({
        where: {
          deletedAt: IsNull(),
          lastVisitAt: MoreThan(new Date(Date.now() - ONLINE_WINDOW_MS)),
        },
      }),
      this.reports.count({ where: { status: 'new' } }),
    ]);

    const [activeProjectsCount, doneProjectsCount, archivedProjectsCount] =
      await Promise.all([
        this.projects.count({
          where: { deletedAt: IsNull(), state: 'active' },
        }),
        this.projects.count({ where: { deletedAt: IsNull(), state: 'done' } }),
        this.projects.count({
          where: { deletedAt: IsNull(), state: 'archived' },
        }),
      ]);

    return {
      usersCount,
      onlineCount,
      activeProjectsCount,
      doneProjectsCount,
      archivedProjectsCount,
      pendingReportsCount,
      signupsLast30Days: await this.signupsLast30Days(),
    };
  }

  async listUsers(
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<Paginated<CurrentUser>> {
    const offset = decodeCursor(cursor);
    const size = clampLimit(limit);

    const [rows, total] = await this.users.findAndCount({
      where: { deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: size,
    });

    // `toCurrentUser` n'expose jamais le hachage du mot de passe : c'est la
    // meme projection que pour la personne elle-meme.
    return toPage(rows.map(toCurrentUser), total, offset);
  }

  async suspendUser(
    admin: UserEntity,
    userId: string,
    reason: string | undefined,
  ): Promise<void> {
    const user = await this.findUserOrFail(userId);
    if (user.platformRole === 'admin') {
      throw ApiError.forbidden("On ne suspend pas un compte d'administration.");
    }

    user.accountStatus = 'suspended';
    await this.users.save(user);
    // Une suspension qui laisserait les sessions ouvertes ne suspendrait rien.
    await this.sessions.revokeAllFor(user.id);

    await this.journal(admin, 'suspend_account', 'user', user.id, reason);
  }

  async reactivateUser(
    admin: UserEntity,
    userId: string,
    reason: string | undefined,
  ): Promise<void> {
    const user = await this.findUserOrFail(userId);

    user.accountStatus = 'active';
    await this.users.save(user);

    await this.journal(admin, 'reactivate_account', 'user', user.id, reason);
  }

  async listProjects(
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<Paginated<ProjectSummary>> {
    const offset = decodeCursor(cursor);
    const size = clampLimit(limit);

    const [rows, total] = await this.projects.findAndCount({
      where: { deletedAt: IsNull() },
      order: { lastActivityAt: 'DESC' },
      skip: offset,
      take: size,
    });

    return toPage(await this.access.summarize(rows), total, offset);
  }

  /**
   * Suppression administrative d'un projet, sans confirmation nominative.
   *
   * Conservee au contrat mais non appelee par l'interface, qui passe par
   * `DELETE /projects/:slug` (ouverte au role admin, avec confirmation) —
   * ecart connu n°11 de SPEC.md.
   */
  async deleteProject(
    admin: UserEntity,
    slug: string,
    reason: string | undefined,
  ): Promise<void> {
    const project = await this.access.findBySlugOrFail(slug);

    await this.projects.update({ id: project.id }, { deletedAt: new Date() });
    await this.journal(admin, 'delete_project', 'project', project.id, reason);

    await this.notifications.notify({
      recipientId: project.ownerId,
      actorId: admin.id,
      type: 'admin_decision',
      targetType: 'project',
      targetId: project.id,
    });
  }

  listTags(): Promise<Tag[]> {
    return this.tags.listAll();
  }

  private async decideReport(
    admin: UserEntity,
    reportId: string,
    status: 'handled' | 'rejected',
    action: AdminActionType,
    reason: string | undefined,
  ): Promise<Report> {
    const report = await this.reports.findOne({ where: { id: reportId } });
    if (!report) throw ApiError.notFound("Ce signalement n'existe pas.");

    report.status = status;
    report.handledBy = admin.id;
    await this.reports.save(report);

    await this.journal(
      admin,
      action,
      report.targetType,
      report.targetId,
      reason,
    );

    return toReport(report);
  }

  /** R-S4 : toute decision laisse une trace, jamais modifiable ensuite. */
  private async journal(
    admin: UserEntity,
    type: AdminActionType,
    targetType: ReportTargetType,
    targetId: string,
    reason: string | undefined,
  ): Promise<void> {
    await this.actions.save(
      this.actions.create({
        adminId: admin.id,
        type,
        targetType,
        targetId,
        reason: reason ?? null,
      }),
    );
  }

  /**
   * R-S2 : la file montre le contenu signale, pas seulement son identifiant.
   * L'apercu est construit au mieux depuis ce qui est deja joignable — jamais
   * invente.
   */
  private async previewTarget(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<ReportTargetPreview | undefined> {
    if (targetType === 'project') {
      const project = await this.projects.findOne({ where: { id: targetId } });
      if (!project) return undefined;

      const owner = await this.users.findOne({
        where: { id: project.ownerId },
      });
      return {
        author: owner ? toUserSummary(owner) : undefined,
        excerpt: project.tagline,
        projectTitle: project.title,
        projectSlug: project.slug,
      };
    }

    if (targetType === 'comment') {
      const comment = await this.comments.findOne({ where: { id: targetId } });
      if (!comment) return undefined;

      const [author, project] = await Promise.all([
        this.users.findOne({ where: { id: comment.authorId } }),
        this.projects.findOne({ where: { id: comment.projectId } }),
      ]);

      return {
        author: author ? toUserSummary(author) : undefined,
        excerpt: comment.body,
        projectTitle: project?.title,
        projectSlug: project?.slug,
      };
    }

    if (targetType === 'user') {
      const user = await this.users.findOne({ where: { id: targetId } });
      if (!user) return undefined;
      return {
        author: toUserSummary(user),
        excerpt: user.bio ?? undefined,
      };
    }

    // `message` : la messagerie n'est pas encore implementee cote backend.
    return undefined;
  }

  private async assertTargetExists(
    targetType: ReportTargetType,
    targetId: string,
  ): Promise<void> {
    const exists =
      targetType === 'project'
        ? await this.projects.findOne({ where: { id: targetId } })
        : targetType === 'comment'
          ? await this.comments.findOne({ where: { id: targetId } })
          : targetType === 'user'
            ? await this.users.findOne({ where: { id: targetId } })
            : null;

    if (!exists) {
      throw ApiError.notFound(
        "Ce contenu n'existe pas ou n'est pas signalable.",
      );
    }
  }

  /** Serie des inscriptions, jour par jour, sur les 30 derniers jours. */
  private async signupsLast30Days(): Promise<AdminStats['signupsLast30Days']> {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 29);

    const rows = await this.users
      .createQueryBuilder('user')
      .select("to_char(date_trunc('day', user.createdAt), 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('user.createdAt >= :since', { since })
      .groupBy('day')
      .getRawMany<{ day: string; count: string }>();

    const byDay = new Map(rows.map((row) => [row.day, Number(row.count)]));

    // Les jours sans inscription valent zero, ils ne disparaissent pas : une
    // courbe a trous se lit de travers.
    return Array.from({ length: 30 }, (_, index) => {
      const date = new Date(since);
      date.setUTCDate(since.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10);
      return { date: key, count: byDay.get(key) ?? 0 };
    });
  }

  private async findUserOrFail(userId: string): Promise<UserEntity> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user || user.deletedAt) {
      throw ApiError.notFound('Cette personne est introuvable.');
    }
    return user;
  }
}
