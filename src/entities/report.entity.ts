import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type {
  ReportReason,
  ReportStatus,
  ReportTargetType,
} from '../contracts/index.js';

/**
 * Signalement (doc 04 §15). `targetId` est polymorphe (`targetType` en decide)
 * : ce n'est donc pas une cle etrangere typee, l'existence de la cible est
 * verifiee a la creation.
 */
@Entity('reports')
@Index(['targetType', 'targetId'])
export class ReportEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType!: ReportTargetType;

  @Column({ name: 'target_id', type: 'uuid' })
  targetId!: string;

  @Column({ type: 'varchar', length: 32 })
  reason!: ReportReason;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  detail!: string | null;

  @Column({ type: 'varchar', length: 16, default: 'new' })
  status!: ReportStatus;

  @Column({ name: 'handled_by', type: 'uuid', nullable: true })
  handledBy!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;
}
