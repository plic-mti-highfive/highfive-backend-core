import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import type {
  Conversation,
  ConversationCreateInput,
  ConversationDetail,
  ConversationSummary,
  UserSummary,
} from '../../contracts/index.js';
import {
  ConversationEntity,
  ConversationParticipantEntity,
  MessageEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { toConversation, toUserSummary } from '../../common/mappers/index.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { appendMessage, assertCanWrite } from './append-message.js';

/**
 * R-MSG1 : cle d'unicite d'une conversation directe. Triee pour que « Alice
 * ecrit a Bob » et « Bob ecrit a Alice » designent le meme fil.
 */
export const directKeyOf = (a: string, b: string): string =>
  [a, b].sort().join(':');

/**
 * Une conversation compte au moins deux personnes (contrat). Seul un canal
 * peut descendre en dessous — un projet dont le porteur est encore seul :
 * il n'est pas montre tant qu'il n'y a personne a qui parler (R-MSG3).
 */
const hasCounterpart =
  (resolved: Resolved) =>
  (conversation: ConversationEntity): boolean =>
    (resolved.participantIds.get(conversation.id)?.length ?? 0) >= 2;

/** Ce que les lectures partagent : participants et projet resolus. */
interface Resolved {
  participantIds: Map<string, string[]>;
  users: Map<string, UserSummary>;
  projects: Map<string, ProjectEntity>;
}

@Injectable()
export class ConversationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    @InjectRepository(ConversationParticipantEntity)
    private readonly participants: Repository<ConversationParticipantEntity>,
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * R-MSG1/R-MSG2 : le type se deduit du nombre de personnes, createur
   * compris — 2 pour une conversation directe, 3 a 50 pour un groupe (le
   * schema plafonne deja les invites a 49). Le premier message part dans la
   * meme transaction : une conversation n'existe jamais vide.
   *
   * Ecrire a quelqu'un avec qui une conversation directe existe deja reprend
   * ce fil plutot que d'en ouvrir un second.
   */
  async create(
    author: UserEntity,
    input: ConversationCreateInput,
  ): Promise<Conversation> {
    assertCanWrite(author);

    const others = [...new Set(input.participantIds)].filter(
      (id) => id !== author.id,
    );
    if (others.length === 0) {
      throw ApiError.validation(
        'Ajoute au moins une autre personne a la conversation.',
        { participantIds: 'Au moins une autre personne.' },
      );
    }

    // Un compte suspendu ou supprime est introuvable ici comme dans la
    // recherche : le message d'erreur ne revele pas son etat.
    const found = await this.users.find({
      where: { id: In(others), accountStatus: 'active' },
    });
    if (found.length !== others.length) {
      throw ApiError.validation(
        'Certaines personnes de la conversation sont introuvables.',
        { participantIds: 'Personne introuvable.' },
      );
    }

    const type = others.length === 1 ? 'direct' : 'group';
    const now = new Date();

    const conversation = await this.dataSource.transaction(async (manager) => {
      let target: ConversationEntity | null;

      if (type === 'direct') {
        const directKey = directKeyOf(author.id, others[0]);
        // `ON CONFLICT DO NOTHING` puis relecture : deux premiers messages
        // simultanes entre les memes personnes aboutissent au meme fil, sans
        // erreur d'unicite remontee a l'une d'elles.
        await manager
          .createQueryBuilder()
          .insert()
          .into(ConversationEntity)
          .values({ type, directKey, createdAt: now })
          .orIgnore()
          .execute();
        target = await manager.findOne(ConversationEntity, {
          where: { directKey },
        });
      } else {
        target = await manager.save(
          manager.create(ConversationEntity, {
            type,
            title: input.title ?? null,
            // R-MSG9 : le createur administre le groupe.
            adminId: author.id,
            createdAt: now,
          }),
        );
      }
      const saved = target!;

      await manager
        .createQueryBuilder()
        .insert()
        .into(ConversationParticipantEntity)
        .values(
          [author.id, ...others].map((userId) => ({
            conversationId: saved.id,
            userId,
            joinedAt: now,
          })),
        )
        .orIgnore()
        .execute();

      await appendMessage(manager, {
        conversationId: saved.id,
        authorId: author.id,
        body: input.message,
      });

      return saved;
    });

    await this.announceMessage(conversation.id, author.id);
    return toConversation(
      conversation,
      await this.participantIdsOf(conversation.id),
    );
  }

  /**
   * Effet de bord de tout message envoye (SPEC.md §3 « Messagerie ») : les
   * autres participants recoivent `message_received`, regroupee par
   * conversation tant qu'elle n'est pas lue (R-N2) — « Alice et 2 autres
   * t'ont envoye un message ». L'auteur, lui, vient de lire la conversation :
   * ses propres notifications sur elle s'eteignent.
   *
   * Appele apres la transaction : une notification qui echoue ne doit pas
   * annuler le message (`notify` avale deja ses erreurs).
   */
  async announceMessage(
    conversationId: string,
    authorId: string,
  ): Promise<void> {
    const recipients = (await this.participantIdsOf(conversationId)).filter(
      (id) => id !== authorId,
    );
    await this.notifications.notifyMany(recipients, {
      actorId: authorId,
      type: 'message_received',
      targetType: 'message',
      targetId: conversationId,
    });
    await this.notifications.markTargetRead(
      authorId,
      'message',
      conversationId,
    );
  }

  /**
   * Toutes les conversations de la personne, la plus recemment active
   * d'abord. Le nombre de requetes ne depend pas du nombre de conversations :
   * chaque champ derive est calcule pour toutes a la fois.
   */
  async list(viewer: UserEntity): Promise<ConversationSummary[]> {
    const memberships = await this.participants.find({
      where: { userId: viewer.id },
    });
    if (memberships.length === 0) return [];

    const conversations = await this.conversations.find({
      where: { id: In(memberships.map((row) => row.conversationId)) },
      order: { lastActivityAt: 'DESC', id: 'ASC' },
    });
    const ids = conversations.map((conversation) => conversation.id);

    const [resolved, lastMessages, unread, replied] = await Promise.all([
      this.resolve(conversations),
      this.lastMessagesOf(ids),
      this.unreadCountsOf(ids, viewer.id),
      this.repliedDirectsOf(
        conversations.filter((c) => c.type === 'direct').map((c) => c.id),
        viewer.id,
      ),
    ]);

    return conversations
      .filter(hasCounterpart(resolved))
      .map((conversation) => {
        const last = lastMessages.get(conversation.id);
        return {
          ...this.detailOf(conversation, resolved),
          lastMessage: last && {
            body: last.body,
            authorId: last.authorId,
            sentAt: last.sentAt.toISOString(),
            deleted: last.deleted,
            // R-MSG8 : un message sans texte s'annonce par sa piece jointe.
            attachmentKind: last.attachmentKind ?? undefined,
          },
          unreadCount: unread.get(conversation.id) ?? 0,
          // R-MSG7 : une conversation directe reste une demande tant que la
          // personne qui la recoit n'y a rien ecrit. Calcule a la lecture : il
          // n'y a pas d'etat « acceptee » a tenir a jour.
          isMessageRequest:
            conversation.type === 'direct' &&
            last !== undefined &&
            !replied.has(conversation.id),
        };
      });
  }

  async detail(
    viewer: UserEntity,
    conversationId: string,
  ): Promise<ConversationDetail> {
    const conversation = await this.findForParticipantOrFail(
      conversationId,
      viewer.id,
    );
    const resolved = await this.resolve([conversation]);
    if (!hasCounterpart(resolved)(conversation)) {
      throw ApiError.notFound('Cette conversation est introuvable.');
    }
    return this.detailOf(conversation, resolved);
  }

  /**
   * Point d'entree de toute route `/conversations/:id/...`. Une conversation
   * dont on n'est pas participant repond 404, pas 403 : on ne confirme pas
   * son existence a qui n'en fait pas partie.
   */
  async findForParticipantOrFail(
    conversationId: string,
    userId: string,
  ): Promise<ConversationEntity> {
    const membership = await this.participants.findOne({
      where: { conversationId, userId },
    });
    const conversation = membership
      ? await this.conversations.findOne({ where: { id: conversationId } })
      : null;
    if (!conversation) {
      throw ApiError.notFound('Cette conversation est introuvable.');
    }
    return conversation;
  }

  /** Participants dans l'ordre d'arrivee, pour un `participantIds` stable. */
  async participantIdsOf(conversationId: string): Promise<string[]> {
    const rows = await this.participants.find({
      where: { conversationId },
      order: { joinedAt: 'ASC', userId: 'ASC' },
    });
    return rows.map((row) => row.userId);
  }

  private detailOf(
    conversation: ConversationEntity,
    resolved: Resolved,
  ): ConversationDetail {
    const participantIds = resolved.participantIds.get(conversation.id) ?? [];
    const project = conversation.projectId
      ? resolved.projects.get(conversation.projectId)
      : undefined;
    return {
      ...toConversation(conversation, participantIds),
      participants: participantIds
        .map((id) => resolved.users.get(id))
        .filter((user): user is UserSummary => user !== undefined),
      // R-MSG3 : un canal porte le nom de son projet, pas un titre propre.
      projectSlug: project?.slug,
      projectTitle: project?.title,
    };
  }

  private async resolve(
    conversations: ConversationEntity[],
  ): Promise<Resolved> {
    const rows = await this.participants.find({
      where: { conversationId: In(conversations.map((c) => c.id)) },
      order: { joinedAt: 'ASC', userId: 'ASC' },
    });
    const participantIds = new Map<string, string[]>();
    for (const row of rows) {
      const list = participantIds.get(row.conversationId) ?? [];
      list.push(row.userId);
      participantIds.set(row.conversationId, list);
    }

    const projectIds = conversations
      .map((c) => c.projectId)
      .filter((id): id is string => id !== null);

    const [users, projects] = await Promise.all([
      this.users.find({
        where: { id: In([...new Set(rows.map((row) => row.userId))]) },
      }),
      projectIds.length
        ? this.projects.find({ where: { id: In(projectIds) } })
        : Promise.resolve([]),
    ]);

    return {
      participantIds,
      // Un compte anonymise (R-P2) reste affiche sous son pseudo de
      // remplacement : le fil garde ses participants.
      users: new Map(users.map((user) => [user.id, toUserSummary(user)])),
      projects: new Map(projects.map((project) => [project.id, project])),
    };
  }

  private async lastMessagesOf(
    conversationIds: string[],
  ): Promise<Map<string, MessageEntity>> {
    const rows = await this.messages
      .createQueryBuilder('m')
      .distinctOn(['m.conversation_id'])
      .where('m.conversationId IN (:...conversationIds)', { conversationIds })
      .orderBy('m.conversation_id')
      .addOrderBy('m.sent_at', 'DESC')
      .addOrderBy('m.id', 'DESC')
      .getMany();
    return new Map(rows.map((row) => [row.conversationId, row]));
  }

  /**
   * Messages des autres posterieurs a la derniere lecture. Un message
   * supprime n'est pas compte : il n'y a plus rien a lire (R-MSG6).
   */
  private async unreadCountsOf(
    conversationIds: string[],
    viewerId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.messages
      .createQueryBuilder('m')
      .select('m.conversation_id', 'conversationId')
      .addSelect('COUNT(*)', 'count')
      .innerJoin(
        ConversationParticipantEntity,
        'p',
        'p.conversation_id = m.conversation_id AND p.user_id = :viewerId',
        { viewerId },
      )
      .where('m.conversation_id IN (:...conversationIds)', { conversationIds })
      .andWhere('m.author_id <> :viewerId', { viewerId })
      .andWhere('m.deleted = false')
      .andWhere('(p.last_read_at IS NULL OR m.sent_at > p.last_read_at)')
      .groupBy('m.conversation_id')
      .getRawMany<{ conversationId: string; count: string }>();
    return new Map(rows.map((row) => [row.conversationId, Number(row.count)]));
  }

  /** Conversations directes dans lesquelles la personne a deja ecrit. */
  private async repliedDirectsOf(
    conversationIds: string[],
    viewerId: string,
  ): Promise<Set<string>> {
    if (conversationIds.length === 0) return new Set();
    const rows = await this.messages
      .createQueryBuilder('m')
      .select('DISTINCT m.conversation_id', 'conversationId')
      .where('m.conversation_id IN (:...conversationIds)', { conversationIds })
      .andWhere('m.author_id = :viewerId', { viewerId })
      .getRawMany<{ conversationId: string }>();
    return new Set(rows.map((row) => row.conversationId));
  }
}
