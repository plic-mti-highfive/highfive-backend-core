import type { EntityManager } from 'typeorm';
import {
  ConversationEntity,
  ConversationParticipantEntity,
  MessageEntity,
  MessageUploadEntity,
  NotificationEntity,
} from '../../entities/index.js';

/**
 * Efface une conversation et tout ce qui en depend, dans la transaction de
 * l'appelant : messages, depots, participations, et les notifications qui y
 * renvoyaient (elles meneraient a une conversation introuvable).
 *
 * Renvoie les cles d'objets a retirer du stockage **apres** la transaction :
 * un objet orphelin est moins grave qu'une suppression annulee alors que les
 * fichiers seraient deja partis.
 */
export async function deleteConversation(
  manager: EntityManager,
  conversationId: string,
): Promise<string[]> {
  const uploads = await manager.find(MessageUploadEntity, {
    where: { conversationId },
  });
  await manager.delete(MessageEntity, { conversationId });
  await manager.delete(MessageUploadEntity, { conversationId });
  await manager.delete(ConversationParticipantEntity, { conversationId });
  await manager.delete(NotificationEntity, {
    targetType: 'message',
    targetId: conversationId,
  });
  await manager.delete(ConversationEntity, { id: conversationId });
  return uploads.map((upload) => upload.storageKey);
}
