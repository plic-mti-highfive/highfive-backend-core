import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  GROUP_MAX_PARTICIPANTS,
  type ConversationDetail,
  type ConversationParticipantsAddInput,
  type ConversationUpdateInput,
} from '../../contracts/index.js';
import {
  ConversationEntity,
  ConversationParticipantEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { assertCanWrite } from './append-message.js';
import { ConversationsService } from './conversations.service.js';
import { deleteConversation } from './delete-conversation.js';

/**
 * R-MSG9 : gestion d'un groupe. Tout participant le renomme, y ajoute des
 * personnes et le quitte ; seul l'administrateur en retire quelqu'un. Une
 * conversation directe reste a deux (R-MSG1), un canal suit son equipe
 * (R-MSG3) : ni l'une ni l'autre ne se gere ainsi.
 */
@Injectable()
export class GroupsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(ConversationEntity)
    private readonly groups: Repository<ConversationEntity>,
    @InjectRepository(ConversationParticipantEntity)
    private readonly participants: Repository<ConversationParticipantEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly conversations: ConversationsService,
    private readonly storage: StorageService,
  ) {}

  async rename(
    user: UserEntity,
    conversationId: string,
    input: ConversationUpdateInput,
  ): Promise<ConversationDetail> {
    assertCanWrite(user);
    await this.findGroupOrFail(conversationId, user);
    await this.groups.update({ id: conversationId }, { title: input.title });
    return this.conversations.detail(user, conversationId);
  }

  /**
   * Qui arrive voit l'historique, sans qu'il compte comme non lu (meme regle
   * que pour un canal). Ajouter quelqu'un qui est deja la ne change rien.
   */
  async addParticipants(
    user: UserEntity,
    conversationId: string,
    input: ConversationParticipantsAddInput,
  ): Promise<ConversationDetail> {
    assertCanWrite(user);
    await this.findGroupOrFail(conversationId, user);

    const wanted = [...new Set(input.participantIds)];
    // Meme regle qu'a la creation : un compte suspendu ou supprime est
    // introuvable, sans que le message revele son etat.
    const found = await this.users.count({
      where: { id: In(wanted), accountStatus: 'active' },
    });
    if (found !== wanted.length) {
      throw ApiError.validation('Certaines personnes sont introuvables.', {
        participantIds: 'Personne introuvable.',
      });
    }

    await this.dataSource.transaction(async (manager) => {
      // Verrou sur le groupe : deux ajouts simultanes ne doivent pas passer
      // chacun le controle du plafond et le depasser ensemble.
      await manager.findOne(ConversationEntity, {
        where: { id: conversationId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = await manager.find(ConversationParticipantEntity, {
        where: { conversationId },
      });
      const present = new Set(current.map((row) => row.userId));
      const newcomers = wanted.filter((id) => !present.has(id));
      if (newcomers.length === 0) return;

      if (current.length + newcomers.length > GROUP_MAX_PARTICIPANTS) {
        throw ApiError.validation(
          `Un groupe compte au plus ${GROUP_MAX_PARTICIPANTS} personnes.`,
          { participantIds: `${GROUP_MAX_PARTICIPANTS} personnes au plus.` },
        );
      }

      const now = new Date();
      await manager.insert(
        ConversationParticipantEntity,
        newcomers.map((userId) => ({
          conversationId,
          userId,
          joinedAt: now,
          lastReadAt: now,
        })),
      );
    });

    return this.conversations.detail(user, conversationId);
  }

  /** Retirer quelqu'un d'autre : l'administrateur seul. Partir, c'est `leave`. */
  async removeParticipant(
    admin: UserEntity,
    conversationId: string,
    userId: string,
  ): Promise<void> {
    assertCanWrite(admin);
    const group = await this.findGroupOrFail(conversationId, admin);

    if ((await this.adminOf(group)) !== admin.id) {
      throw ApiError.forbidden(
        "Seul l'administrateur du groupe peut en retirer quelqu'un.",
      );
    }
    if (userId === admin.id) {
      throw ApiError.validation('Pour partir, quitte le groupe.');
    }

    const { affected } = await this.participants.delete({
      conversationId,
      userId,
    });
    if (!affected) {
      throw ApiError.notFound("Cette personne n'est pas dans le groupe.");
    }
  }

  /**
   * Partir n'ecrit rien : un compte suspendu peut quitter un groupe. Si
   * l'administrateur part, le plus ancien participant restant prend le role ;
   * si plus personne ne reste, le groupe est efface.
   */
  async leave(user: UserEntity, conversationId: string): Promise<void> {
    const group = await this.findGroupOrFail(conversationId, user);
    const admin = await this.adminOf(group);

    const storageKeys = await this.dataSource.transaction(async (manager) => {
      await manager.findOne(ConversationEntity, {
        where: { id: conversationId },
        lock: { mode: 'pessimistic_write' },
      });
      await manager.delete(ConversationParticipantEntity, {
        conversationId,
        userId: user.id,
      });
      const remaining = await manager.find(ConversationParticipantEntity, {
        where: { conversationId },
        order: { joinedAt: 'ASC', userId: 'ASC' },
      });

      if (remaining.length === 0) {
        return deleteConversation(manager, conversationId);
      }
      if (admin === user.id || group.adminId === null) {
        await manager.update(
          ConversationEntity,
          { id: conversationId },
          { adminId: remaining[0].userId },
        );
      }
      return [];
    });
    for (const key of storageKeys) await this.storage.remove(key);
  }

  private async findGroupOrFail(
    conversationId: string,
    user: UserEntity,
  ): Promise<ConversationEntity> {
    const conversation = await this.conversations.findForParticipantOrFail(
      conversationId,
      user.id,
    );
    if (conversation.type === 'direct') {
      throw ApiError.forbidden(
        "Une conversation directe reste a deux : elle ne se renomme pas, ne s'agrandit pas et ne se quitte pas.",
      );
    }
    if (conversation.type === 'channel') {
      throw ApiError.forbidden(
        "Un canal suit l'equipe de son projet : il se gere depuis le projet.",
      );
    }
    return conversation;
  }

  /** L'administrateur enregistre, ou le plus ancien participant a defaut. */
  private async adminOf(
    group: ConversationEntity,
  ): Promise<string | undefined> {
    return (
      group.adminId ?? (await this.conversations.participantIdsOf(group.id))[0]
    );
  }
}
