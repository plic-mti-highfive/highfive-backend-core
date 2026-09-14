import { Column, Entity, Index, PrimaryColumn } from 'typeorm';
import type { MembershipRole } from '../contracts/index.js';

/**
 * Appartenance (doc 04 §5). R-M1 : exactement un `owner` par projet a tout
 * instant — garanti par l'index unique partiel ci-dessous, et par le
 * caractere transactionnel de la creation et du transfert.
 *
 * R-M4 : exclure supprime la ligne ; bloquer la conserve avec `blocked = true`,
 * ce qui empeche de rejoindre a nouveau et de commenter (R-V8).
 */
@Entity('memberships')
@Index('uq_memberships_single_owner', ['projectId'], {
  unique: true,
  where: "role = 'owner'",
})
export class MembershipEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 16 })
  role!: MembershipRole;

  @Column({ name: 'joined_at', type: 'timestamptz', default: () => 'now()' })
  joinedAt!: Date;

  @Column({ type: 'boolean', default: false })
  blocked!: boolean;
}
