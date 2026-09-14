import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  NotificationTargetType,
  NotificationType,
} from '../contracts/index.js';
import { UserEntity } from './user.entity.js';

/**
 * Notification (doc 04 §14).
 *
 * R-N2 (regroupement) est realise par la table de jointure des acteurs : un
 * nouvel evenement sur une cible deja notifiee et non lue ajoute une ligne
 * d'acteur a la notification existante (« Sophie et 4 autres... ») au lieu
 * d'en creer une seconde.
 */
@Entity('notifications')
@Index(['recipientId', 'createdAt'])
export class NotificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  @Column({ type: 'varchar', length: 48 })
  type!: NotificationType;

  @ManyToMany(() => UserEntity, { eager: true })
  @JoinTable({
    name: 'notification_actors',
    joinColumn: { name: 'notification_id' },
    inverseJoinColumn: { name: 'user_id' },
  })
  actors!: UserEntity[];

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType!: NotificationTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'boolean', default: false })
  read!: boolean;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
