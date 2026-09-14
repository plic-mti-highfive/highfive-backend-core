import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { InvitationStatus, MembershipRole } from '../contracts/index.js';

/**
 * Invitation (doc 04 §6). R-I1 : expiration 30 jours — calculee a la creation
 * et appliquee a la lecture (`pending` + `expiresAt` passe = `expired`), ce
 * qui evite de dependre d'un travail planifie pour rester juste.
 */
@Entity('invitations')
export class InvitationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  @Index()
  @Column({ name: 'recipient_id', type: 'uuid' })
  recipientId!: string;

  /** Jamais `owner` : la propriete se transfere, elle ne s'invite pas. */
  @Column({ name: 'proposed_role', type: 'varchar', length: 16 })
  proposedRole!: Exclude<MembershipRole, 'owner'>;

  @Column({ type: 'varchar', length: 300, nullable: true })
  message!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: InvitationStatus;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
