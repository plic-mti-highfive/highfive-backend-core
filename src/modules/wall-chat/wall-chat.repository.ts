import type { WallChatRole } from '../../entities/wall-chat-message.entity.js';

export interface WallChatMessage {
  /** Identifiant du message dans le Y.Doc du Mur : cle d'idempotence. */
  id: string;
  projectId: string;
  canvasId: string;
  authorId: string;
  role: WallChatRole;
  body: string;
  sentAt: Date;
}

/**
 * Persistance des messages du chat du Mur.
 *
 * Interface plutot qu'implementation : la messagerie (conversations) est
 * developpee a part, et c'est elle qui devra, le moment venu, stocker ces
 * messages. Il suffira de fournir une autre implementation sous ce jeton.
 */
export abstract class WallChatRepository {
  /** Renvoie `false` sans rien ecrire si l'`id` existe deja (idempotent). */
  abstract saveIfAbsent(message: WallChatMessage): Promise<boolean>;

  /** Les `limit` derniers messages du projet, en ordre chronologique. */
  abstract recent(projectId: string, limit: number): Promise<WallChatMessage[]>;
}
