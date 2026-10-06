import type { EntityManager } from 'typeorm';
import {
  ConversationEntity,
  ConversationParticipantEntity,
  MessageEntity,
  type UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';

/** Meme regle que R-C2 pour les commentaires : un compte suspendu n'ecrit plus. */
export function assertCanWrite(author: UserEntity): void {
  if (author.accountStatus !== 'active') {
    throw ApiError.forbidden(
      'Ton compte est suspendu : tu ne peux pas envoyer de message.',
    );
  }
}

/**
 * Ecrit un message et ce qu'il entraine, dans la transaction de l'appelant :
 * le fil remonte en tete de liste, et l'auteur est repute avoir lu jusque-la
 * — on ne repond pas a une conversation sans l'avoir sous les yeux.
 *
 * Partage par la creation d'une conversation (premier message) et par
 * l'envoi dans une conversation existante.
 */
export async function appendMessage(
  manager: EntityManager,
  message: Pick<MessageEntity, 'conversationId' | 'authorId' | 'body'> &
    Partial<
      Pick<
        MessageEntity,
        'attachmentKind' | 'attachmentProjectId' | 'attachmentFileId'
      >
    >,
): Promise<MessageEntity> {
  const sentAt = new Date();
  const saved = await manager.save(
    manager.create(MessageEntity, { ...message, sentAt }),
  );
  await manager.update(
    ConversationParticipantEntity,
    { conversationId: message.conversationId, userId: message.authorId },
    { lastReadAt: sentAt },
  );
  await manager.update(
    ConversationEntity,
    { id: message.conversationId },
    { lastActivityAt: sentAt },
  );
  return saved;
}
