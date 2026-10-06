import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, QueryFailedError, Repository } from 'typeorm';
import type {
  MessageCreateInput,
  MessageWithAuthor,
  Paginated,
} from '../../contracts/index.js';
import {
  ConversationParticipantEntity,
  MessageEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { DEFAULT_PAGE_SIZE } from '../../common/http/pagination.js';
import { toMessage, toUserSummary } from '../../common/mappers/index.js';
import { appendMessage, assertCanWrite } from './append-message.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ConversationsService } from './conversations.service.js';
import {
  MessageAttachmentsService,
  notFound,
} from './message-attachments.service.js';
import { decodeMessageCursor, encodeMessageCursor } from './message-cursor.js';

/** Violation d'unicite Postgres (`23505`), quelle que soit la requete. */
const isUniqueViolation = (error: unknown): boolean =>
  error instanceof QueryFailedError &&
  (error.driverError as { code?: string }).code === '23505';

@Injectable()
export class MessagesService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(ConversationParticipantEntity)
    private readonly participants: Repository<ConversationParticipantEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly conversations: ConversationsService,
    private readonly attachments: MessageAttachmentsService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * La premiere page porte les messages **les plus recents**, chaque page
   * restant dans l'ordre chronologique : c'est ce que l'ecran affiche tel
   * quel (le plus ancien en haut, defilement vers le bas), et `nextCursor`
   * remonte vers les plus anciens. Le mock servait les plus anciens d'abord,
   * ce qui cachait la fin de toute conversation de plus d'une page.
   */
  async list(
    viewer: UserEntity,
    conversationId: string,
    cursor: string | undefined,
  ): Promise<Paginated<MessageWithAuthor>> {
    await this.conversations.findForParticipantOrFail(
      conversationId,
      viewer.id,
    );
    const after = decodeMessageCursor(cursor);

    const query = this.messages
      .createQueryBuilder('m')
      .where('m.conversation_id = :conversationId', { conversationId })
      .orderBy('m.sent_at', 'DESC')
      .addOrderBy('m.id', 'DESC')
      // Un de plus que la page : sa presence dit s'il reste des messages.
      .limit(DEFAULT_PAGE_SIZE + 1);
    if (after) {
      query.andWhere('(m.sent_at, m.id) < (:sentAt, :id)', after);
    }

    const [rows, total] = await Promise.all([
      query.getMany(),
      this.messages.count({ where: { conversationId } }),
    ]);
    const page = rows.slice(0, DEFAULT_PAGE_SIZE);
    const oldest = page.at(-1);

    return {
      items: await this.withAuthors(conversationId, page.reverse(), viewer),
      nextCursor:
        rows.length > DEFAULT_PAGE_SIZE && oldest
          ? encodeMessageCursor(oldest)
          : null,
      total,
    };
  }

  async send(
    author: UserEntity,
    conversationId: string,
    input: MessageCreateInput,
  ): Promise<MessageWithAuthor> {
    assertCanWrite(author);
    await this.conversations.findForParticipantOrFail(
      conversationId,
      author.id,
    );

    const attachment = await this.attachments.toColumns(
      author,
      conversationId,
      input.attachment,
    );

    let message: MessageEntity;
    try {
      message = await this.dataSource.transaction((manager) =>
        appendMessage(manager, {
          conversationId,
          authorId: author.id,
          // R-MSG8 : le schema n'admet un texte absent qu'avec une piece jointe.
          body: input.body ?? '',
          ...attachment,
        }),
      );
    } catch (error) {
      // Deux envois simultanes du meme depot : le second bute sur l'index
      // unique, et repond comme s'il avait ete verifie le second.
      if (isUniqueViolation(error) && attachment.attachmentUploadId) {
        throw notFound('upload');
      }
      throw error;
    }
    await this.conversations.announceMessage(conversationId, author.id);
    const [withAuthor] = await this.withAuthors(
      conversationId,
      [message],
      author,
    );
    return withAuthor;
  }

  /**
   * R-MSG5 : l'auteur seul, sans limite de temps — `editedAt` signale la
   * modification aux autres participants. Un message supprime ne revient pas.
   */
  async edit(
    author: UserEntity,
    messageId: string,
    body: string,
  ): Promise<MessageWithAuthor> {
    assertCanWrite(author);
    const message = await this.findOwnOrFail(author, messageId);

    if (message.deleted) {
      throw ApiError.forbidden(
        'Ce message a ete supprime : il ne peut plus etre modifie.',
      );
    }

    message.body = body;
    message.editedAt = new Date();
    await this.messages.save(message);

    const [withAuthor] = await this.withAuthors(
      message.conversationId,
      [message],
      author,
    );
    return withAuthor;
  }

  /**
   * R-MSG6 : le message reste a sa place dans le fil (« Message supprime »),
   * vide de son texte et de sa piece jointe. Recommencer ne change rien :
   * la route est idempotente. Un compte suspendu peut encore retirer ce
   * qu'il a ecrit.
   */
  async remove(author: UserEntity, messageId: string): Promise<void> {
    const message = await this.findOwnOrFail(author, messageId);
    if (message.deleted) return;

    await this.messages.update(
      { id: message.id },
      {
        deleted: true,
        body: '',
        attachmentKind: null,
        attachmentProjectId: null,
        attachmentFileId: null,
        attachmentUploadId: null,
      },
    );
    if (message.attachmentUploadId) {
      await this.attachments.discardUpload(message.attachmentUploadId);
    }
  }

  /** Tout ce qui a ete envoye jusqu'ici est lu (`unreadCount` retombe a 0). */
  async markRead(viewer: UserEntity, conversationId: string): Promise<void> {
    await this.conversations.findForParticipantOrFail(
      conversationId,
      viewer.id,
    );
    await this.participants.update(
      { conversationId, userId: viewer.id },
      { lastReadAt: new Date() },
    );
    await this.notifications.markTargetRead(
      viewer.id,
      'message',
      conversationId,
    );
  }

  /**
   * Un message d'autrui, ou d'une conversation qu'on a quittee, repond 404 :
   * meme regle que pour les conversations, on ne confirme pas son existence.
   */
  private async findOwnOrFail(
    author: UserEntity,
    messageId: string,
  ): Promise<MessageEntity> {
    const message = await this.messages.findOne({ where: { id: messageId } });
    const isParticipant =
      message?.authorId === author.id &&
      (await this.participants.exists({
        where: { conversationId: message.conversationId, userId: author.id },
      }));
    if (!message || !isParticipant) {
      throw ApiError.notFound('Ce message est introuvable.');
    }
    return message;
  }

  /**
   * `readBy` se deduit des `last_read_at` (SPEC.md §2) : a lu un message
   * quiconque a lu la conversation depuis son envoi — et son auteur, toujours.
   * L'apercu de piece jointe depend de ce que `viewer` a le droit de voir.
   */
  private async withAuthors(
    conversationId: string,
    messages: MessageEntity[],
    viewer: UserEntity,
  ): Promise<MessageWithAuthor[]> {
    if (messages.length === 0) return [];

    const [participants, authors, previews] = await Promise.all([
      this.participants.find({
        where: { conversationId },
        order: { joinedAt: 'ASC', userId: 'ASC' },
      }),
      this.users.find({
        where: { id: In([...new Set(messages.map((m) => m.authorId))]) },
      }),
      this.attachments.previewsFor(messages, viewer),
    ]);
    const authorById = new Map(authors.map((user) => [user.id, user]));

    return messages.map((message) => {
      const readBy = new Set([message.authorId]);
      for (const participant of participants) {
        if (
          participant.lastReadAt &&
          participant.lastReadAt >= message.sentAt
        ) {
          readBy.add(participant.userId);
        }
      }
      return {
        ...toMessage(message, [...readBy]),
        // Un compte n'est jamais efface, seulement anonymise (R-P2) : l'auteur
        // existe toujours et s'affiche sous son pseudo de remplacement.
        author: toUserSummary(authorById.get(message.authorId)!),
        attachmentPreview: previews.get(message.id),
      };
    });
  }
}
