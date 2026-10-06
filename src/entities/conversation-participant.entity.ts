import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Participation a une conversation. `last_read_at` remplace le `readBy[]` de
 * chaque message (SPEC.md §2) : une ligne par personne plutot qu'une par
 * message lu. `unreadCount` et `readBy[]` en sont deduits a la lecture.
 */
@Entity('conversation_participants')
export class ConversationParticipantEntity {
  @PrimaryColumn({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  /** La liste « mes conversations » part de la personne, pas du fil. */
  @Index()
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  /** Meme precision que `messages.sent_at`, auquel il est compare. */
  @Column({
    name: 'last_read_at',
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  lastReadAt!: Date | null;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
  joinedAt!: Date;
}
