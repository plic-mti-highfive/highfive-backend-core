import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationEntity, MessageEntity } from '../../entities/index.js';
import { ChannelsService } from '../conversations/channels.service.js';
import { ASSISTANT_USER_ID } from './wall-chat.constants.js';
import { WallChatMessage, WallChatRepository } from './wall-chat.repository.js';

/**
 * Chat du Mur sur la messagerie : un `MessageEntity` par message, dans la
 * conversation `kind = 'wall'` du projet. La conversation et ses participants
 * (l'equipe) sont tenus par `ChannelsService`.
 */
@Injectable()
export class TypeormWallChatRepository extends WallChatRepository {
  constructor(
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(ConversationEntity)
    private readonly conversations: Repository<ConversationEntity>,
    private readonly channels: ChannelsService,
  ) {
    super();
  }

  conversationIdOf(projectId: string): Promise<string | undefined> {
    return this.channels.wallConversationId(projectId);
  }

  async saveIfAbsent(message: WallChatMessage): Promise<boolean> {
    const conversationId = await this.conversationIdOf(message.projectId);
    // Projet supprime entre-temps : rien a conserver.
    if (!conversationId) return false;
    // `ON CONFLICT DO NOTHING` : deux jobs concurrents (ou un rejeu) pour le
    // meme id ne produisent qu'une ligne ; `raw` est vide si rien n'a ete ecrit.
    const result = await this.messages
      .createQueryBuilder()
      .insert()
      .values({
        id: message.id,
        conversationId,
        authorId: message.authorId,
        body: message.body,
        sentAt: message.sentAt,
      })
      .orIgnore()
      .returning('id')
      .execute();
    return (result.raw as unknown[]).length > 0;
  }

  async findById(id: string): Promise<WallChatMessage | undefined> {
    const row = await this.messages.findOneBy({ id });
    if (!row) return undefined;
    const conversation = await this.conversations.findOneBy({
      id: row.conversationId,
      kind: 'wall',
    });
    return conversation?.projectId
      ? toWallMessage(row, conversation.projectId)
      : undefined;
  }

  async recent(projectId: string, limit: number): Promise<WallChatMessage[]> {
    const conversation = await this.conversations.findOne({
      select: { id: true },
      where: { kind: 'wall', projectId },
    });
    if (!conversation) return [];
    const rows = await this.messages.find({
      where: { conversationId: conversation.id, deleted: false },
      order: { sentAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return rows.reverse().map((row) => toWallMessage(row, projectId));
  }
}

const toWallMessage = (
  row: MessageEntity,
  projectId: string,
): WallChatMessage => ({
  id: row.id,
  projectId,
  authorId: row.authorId,
  role: row.authorId === ASSISTANT_USER_ID ? 'assistant' : 'user',
  body: row.body,
  sentAt: row.sentAt,
});
