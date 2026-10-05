import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

export type WallChatRole = 'user' | 'assistant';

/**
 * Message du chat du Mur, stocke cote core.
 *
 * Table provisoire, dediee : la messagerie n'existe pas encore dans le core.
 * `id` est celui du message dans le Y.Doc (pas genere ici), ce qui rend la
 * consommation de la file idempotente. Voir `WallChatRepository`.
 */
@Entity('wall_chat_messages')
@Index(['projectId', 'sentAt'])
export class WallChatMessageEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'canvas_id', type: 'uuid' })
  canvasId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: WallChatRole;

  @Column({ type: 'text' })
  body!: string;

  @Column({ name: 'sent_at', type: 'timestamptz' })
  sentAt!: Date;
}
