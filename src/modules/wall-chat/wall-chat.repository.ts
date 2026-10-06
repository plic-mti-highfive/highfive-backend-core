export type WallChatRole = 'user' | 'assistant';

export interface WallChatMessage {
  /**
   * Identifiant du message dans le Y.Doc du Mur : devient l'id du
   * `MessageEntity`, donc cle d'idempotence.
   */
  id: string;
  projectId: string;
  authorId: string;
  /** Derive de l'auteur (`ASSISTANT_USER_ID`) : pas de colonne dediee. */
  role: WallChatRole;
  body: string;
  sentAt: Date;
}

/**
 * Persistance des messages du chat du Mur.
 *
 * Implementee sur la messagerie (`ConversationEntity` de `kind = 'wall'` +
 * `MessageEntity`) ; l'interface reste le point de substitution des tests.
 */
export abstract class WallChatRepository {
  /** Renvoie `false` sans rien ecrire si l'`id` existe deja (idempotent). */
  abstract saveIfAbsent(message: WallChatMessage): Promise<boolean>;

  /** Un message par son `id`, ou `undefined`. */
  abstract findById(id: string): Promise<WallChatMessage | undefined>;

  /** Les `limit` derniers messages du projet, en ordre chronologique. */
  abstract recent(projectId: string, limit: number): Promise<WallChatMessage[]>;

  /** Identifiant de la conversation `wall` du projet (creee au besoin). */
  abstract conversationIdOf(projectId: string): Promise<string | undefined>;
}
