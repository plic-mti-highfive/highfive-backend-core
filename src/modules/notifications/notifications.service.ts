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
  ConversationEntity,
  ConversationParticipantEntity,
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
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(ConversationParticipantEntity)
    private readonly participants: Repository<ConversationParticipantEntity>,
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

  /**
   * Notifie plusieurs destinataires du meme evenement — memes regles que
   * `notify`, mais lues en une fois : preferences, acteur et notifications
   * deja ouvertes tiennent en trois requetes quel que soit le nombre de
   * destinataires, et les ecritures partent ensemble. C'est ce qui garde
   * l'envoi d'un message dans un grand canal (R-MSG3, sans plafond) a un cout
   * raisonnable.
   */
  async notifyMany(
    recipientIds: string[],
    input: Omit<NotifyInput, 'recipientId'>,
  ): Promise<void> {
    try {
      const candidates = [...new Set(recipientIds)].filter(
        (id) => id !== input.actorId || input.allowSelf,
      );
      if (candidates.length === 0) return;

      const [preferences, actor, open] = await Promise.all([
        this.preferences.find({
          where: { userId: In(candidates), type: input.type },
        }),
        this.users.findOne({ where: { id: input.actorId } }),
        this.notifications.find({
          where: {
            recipientId: In(candidates),
            type: input.type,
            targetType: input.targetType,
            targetId: input.targetId,
            read: false,
          },
          order: { createdAt: 'DESC' },
        }),
      ]);
      if (!actor) return;

      const channelsByUser = new Map(
        preferences.map((row) => [row.userId, row.channels]),
      );
      const recipients = candidates.filter((id) =>
        (channelsByUser.get(id) ?? defaultChannelsFor(input.type)).includes(
          'app',
        ),
      );

      // La plus recente par destinataire, comme `notify`.
      const openByRecipient = new Map<string, NotificationEntity>();
      for (const row of open) {
        if (!openByRecipient.has(row.recipientId)) {
          openByRecipient.set(row.recipientId, row);
        }
      }

      const now = new Date();
      const toSave: NotificationEntity[] = [];
      for (const recipientId of recipients) {
        const existing = openByRecipient.get(recipientId);
        if (!existing) {
          toSave.push(
            this.notifications.create({
              recipientId,
              type: input.type,
              targetType: input.targetType,
              targetId: input.targetId,
              actors: [actor],
              read: false,
            }),
          );
        } else if (!existing.actors.some((user) => user.id === actor.id)) {
          existing.actors = [actor, ...existing.actors];
          existing.createdAt = now;
          toSave.push(existing);
        }
      }
      if (toSave.length) await this.notifications.save(toSave);
    } catch (error) {
      this.logger.warn(`Notifications non emises: ${String(error)}`);
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
      const target = await this.resolveTarget(
        row.targetType,
        row.targetId,
        userId,
      );
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

  /**
   * Lire la cible vaut lire ce qui y renvoyait : ouvrir une conversation
   * eteint ses notifications `message_received`, sans quoi elles
   * s'accumuleraient pour des messages deja lus.
   */
  async markTargetRead(
    userId: string,
    targetType: NotificationTargetType,
    targetId: string,
  ): Promise<void> {
    await this.notifications.update(
      { recipientId: userId, targetType, targetId, read: false },
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
    recipientId: string,
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

    // `message` : la cible est la conversation (le regroupement R-N2 se fait
    // donc par conversation). Qui n'en fait plus partie n'a plus de lien
    // valable a suivre : la notification est ecartee.
    const [conversation, isParticipant] = await Promise.all([
      this.conversations.findOne({ where: { id: targetId } }),
      this.participants.exists({
        where: { conversationId: targetId, userId: recipientId },
      }),
    ]);
    if (!conversation || !isParticipant) return null;

    // Un groupe a son titre, un canal celui de son projet ; une conversation
    // directe n'en a pas — le front affiche alors l'acteur.
    const project = conversation.projectId
      ? await this.projects.findOne({ where: { id: conversation.projectId } })
      : null;
    return {
      type: 'message',
      conversationId: conversation.id,
      conversationTitle: conversation.title ?? project?.title ?? undefined,
    };
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
