import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type {
  NotificationChannel,
  NotificationPreference,
  NotificationSummary,
  NotificationTarget,
  NotificationTargetType,
  NotificationType,
  Paginated,
} from '../../contracts/index.js';
import {
  ColumnEntity,
  CommentEntity,
  NotificationEntity,
  NotificationPreferenceEntity,
  ProjectEntity,
  TaskEntity,
  UserEntity,
} from '../../entities/index.js';
import {
  clampLimit,
  decodeCursor,
  toPage,
} from '../../common/http/pagination.js';
import { toUserSummary } from '../../common/mappers/index.js';
import {
  NOTIFICATION_TYPES,
  defaultChannelsFor,
  defaultPreferences,
} from './notification-defaults.js';

export interface NotifyInput {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  targetType: NotificationTargetType;
  targetId: string;
  /**
   * Autorise une notification dont l'acteur est le destinataire. Reserve aux
   * decisions prises par la plateforme elle-meme (archivage automatique) :
   * faute de compte systeme, l'acteur affiche est la personne concernee.
   */
  allowSelf?: boolean;
}

/**
 * Notifications (doc 04 §14).
 *
 * Emettre une notification ne doit jamais faire echouer l'action qui l'a
 * declenchee : `notify` avale ses erreurs et les journalise. Une annonce
 * publiee reste publiee meme si la notification echoue.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationEntity)
    private readonly notifications: Repository<NotificationEntity>,
    @InjectRepository(NotificationPreferenceEntity)
    private readonly preferences: Repository<NotificationPreferenceEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(TaskEntity)
    private readonly tasks: Repository<TaskEntity>,
    @InjectRepository(ColumnEntity)
    private readonly columns: Repository<ColumnEntity>,
    @InjectRepository(CommentEntity)
    private readonly comments: Repository<CommentEntity>,
  ) {}

  /**
   * R-N2 : un evenement sur une cible deja notifiee et non lue ajoute un
   * acteur a la notification existante (« Sophie et 4 autres... ») plutot que
   * d'en creer une nouvelle. La fenetre de regroupement est « tant que ce
   * n'est pas lu » : une fois lue, la suite merite un nouvel evenement.
   */
  async notify(input: NotifyInput): Promise<void> {
    try {
      // Personne n'a besoin d'etre prevenu de ses propres actes — sauf quand
      // c'est la plateforme qui agit en son nom.
      if (input.recipientId === input.actorId && !input.allowSelf) return;

      const channels = await this.channelsFor(input.recipientId, input.type);
      if (!channels.includes('app')) return;

      const actor = await this.users.findOne({ where: { id: input.actorId } });
      if (!actor) return;

      const existing = await this.notifications.findOne({
        where: {
          recipientId: input.recipientId,
          type: input.type,
          targetType: input.targetType,
          targetId: input.targetId,
          read: false,
        },
        order: { createdAt: 'DESC' },
      });

      if (existing) {
        if (existing.actors.some((user) => user.id === actor.id)) return;
        existing.actors = [actor, ...existing.actors];
        existing.createdAt = new Date();
        await this.notifications.save(existing);
        return;
      }

      await this.notifications.save(
        this.notifications.create({
          recipientId: input.recipientId,
          type: input.type,
          targetType: input.targetType,
          targetId: input.targetId,
          actors: [actor],
          read: false,
        }),
      );
    } catch (error) {
      this.logger.warn(`Notification non emise: ${String(error)}`);
    }
  }

  /** Notifie plusieurs destinataires du meme evenement. */
  async notifyMany(
    recipientIds: string[],
    input: Omit<NotifyInput, 'recipientId'>,
  ): Promise<void> {
    for (const recipientId of new Set(recipientIds)) {
      await this.notify({ ...input, recipientId });
    }
  }

  async list(
    userId: string,
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<Paginated<NotificationSummary>> {
    const offset = decodeCursor(cursor);
    const size = clampLimit(limit);

    const [rows, total] = await this.notifications.findAndCount({
      where: { recipientId: userId },
      order: { createdAt: 'DESC' },
      skip: offset,
      take: size,
    });

    const items: NotificationSummary[] = [];
    for (const row of rows) {
      const target = await this.resolveTarget(row.targetType, row.targetId);
      // R-N3 : sans cible resolue, le lien serait faux — on prefere ne pas
      // afficher la notification plutot que d'envoyer la personne nulle part.
      if (!target) continue;

      items.push({
        id: row.id,
        recipientId: row.recipientId,
        type: row.type,
        actorIds: row.actors.map((user) => user.id),
        targetType: row.targetType,
        targetId: row.targetId,
        read: row.read,
        createdAt: row.createdAt.toISOString(),
        actors: row.actors.map(toUserSummary),
        target,
      });
    }

    return toPage(items, total, offset);
  }

  async markRead(userId: string, notificationId: string): Promise<void> {
    await this.notifications.update(
      { id: notificationId, recipientId: userId },
      { read: true },
    );
  }

  async markAllRead(userId: string): Promise<void> {
    await this.notifications.update(
      { recipientId: userId, read: false },
      { read: true },
    );
  }

  /**
   * R-N4 : l'absence de ligne vaut « defauts ». On ne materialise donc que ce
   * que la personne a explicitement regle, et on complete a la lecture.
   */
  async listPreferences(userId: string): Promise<NotificationPreference[]> {
    const rows = await this.preferences.find({ where: { userId } });
    const byType = new Map(rows.map((row) => [row.type, row.channels]));

    return defaultPreferences().map((preference) => ({
      type: preference.type,
      channels: byType.get(preference.type) ?? preference.channels,
    }));
  }

  async updatePreferences(
    userId: string,
    input: NotificationPreference[],
  ): Promise<NotificationPreference[]> {
    const wanted = new Map(input.map((p) => [p.type, p.channels]));

    for (const type of NOTIFICATION_TYPES) {
      const channels = wanted.get(type);
      if (!channels) continue;

      const isDefault =
        [...channels].sort().join(',') ===
        [...defaultChannelsFor(type)].sort().join(',');

      if (isDefault) {
        await this.preferences.delete({ userId, type });
      } else {
        await this.preferences.save(
          this.preferences.create({ userId, type, channels }),
        );
      }
    }

    return this.listPreferences(userId);
  }

  private async channelsFor(
    userId: string,
    type: NotificationType,
  ): Promise<NotificationChannel[]> {
    const row = await this.preferences.findOne({ where: { userId, type } });
    return row?.channels ?? defaultChannelsFor(type);
  }

  /**
   * R-N3 : la cible est resolue cote serveur pour que le front construise le
   * lien exact (`/projets/:slug`, `/projets/:slug/lab/taches`, `/messages/:id`)
   * sans requete supplementaire.
   */
  private async resolveTarget(
    targetType: NotificationTargetType,
    targetId: string,
  ): Promise<NotificationTarget | null> {
    if (targetType === 'project' || targetType === 'comment') {
      const projectId =
        targetType === 'project'
          ? targetId
          : (await this.comments.findOne({ where: { id: targetId } }))
              ?.projectId;
      if (!projectId) return null;

      const project = await this.projects.findOne({ where: { id: projectId } });
      if (!project || project.deletedAt) return null;

      return {
        type: targetType,
        projectSlug: project.slug,
        projectTitle: project.title,
      };
    }

    if (targetType === 'task') {
      const task = await this.tasks.findOne({ where: { id: targetId } });
      if (!task) return null;

      const column = await this.columns.findOne({
        where: { id: task.columnId },
      });
      if (!column) return null;

      const project = await this.projects.findOne({
        where: { id: column.projectId },
      });
      if (!project || project.deletedAt) return null;

      return {
        type: 'task',
        projectSlug: project.slug,
        projectTitle: project.title,
        taskTitle: task.title,
      };
    }

    // `message` : la messagerie n'est pas encore implementee cote backend
    // (voir docs/REFACTO-V2.md). Aucune notification de ce type n'est emise,
    // et une ligne heritee ne serait pas routable.
    return null;
  }

  /** Utilise par l'administration : compte des personnes a notifier d'un coup. */
  async recipientsOfProject(projectId: string): Promise<string[]> {
    const rows = await this.notifications.find({
      where: { targetType: 'project', targetId: projectId },
    });
    return [...new Set(rows.map((row) => row.recipientId))];
  }

  /** Purge des notifications pointant une cible supprimee. */
  async dropForTargets(
    targetType: NotificationTargetType,
    targetIds: string[],
  ): Promise<void> {
    if (targetIds.length === 0) return;
    await this.notifications.delete({ targetType, targetId: In(targetIds) });
  }
}
