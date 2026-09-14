import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { JoinRequestStatus } from '../contracts/index.js';

/**
 * Demande a rejoindre (doc 04 §6).
 *
 * L'index unique partiel empeche deux demandes `pending` de la meme personne
 * sur le meme projet — absent du mock, ajoute ici. R-D2 (renouveler apres un
 * refus de plus de 30 jours) se verifie sur `decidedAt` a la creation, pas par
 * un index : la contrainte serait alors fausse des le 31e jour.
 */
@Entity('join_requests')
@Index('uq_join_requests_pending', ['projectId', 'userId'], {
  unique: true,
  where: "status = 'pending'",
})
export class JoinRequestEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  message!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status!: JoinRequestStatus;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt!: Date | null;
}
