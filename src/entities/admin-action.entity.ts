import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { AdminActionType, ReportTargetType } from '../contracts/index.js';

/**
 * Journal d'administration (R-S4) : table en ajout seul. Aucune route ne la
 * modifie ni ne la supprime — c'est ce qui fait d'elle une trace, et pas un
 * simple etat.
 */
@Entity('admin_actions')
export class AdminActionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'admin_id', type: 'uuid' })
  adminId!: string;

  @Column({ type: 'varchar', length: 32 })
  type!: AdminActionType;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType!: ReportTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  reason!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
