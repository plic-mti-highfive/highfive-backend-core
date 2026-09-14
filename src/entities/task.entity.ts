import {
  Column,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { UserEntity } from './user.entity.js';

/**
 * Tache (doc 04 §11). R-K4 : seul le titre est obligatoire. R-K6 : `dueDate`
 * est purement informative, le serveur n'en tire aucune consequence.
 *
 * `wallOriginId` garde le lien vers l'element du Mur qui a produit la tache
 * (R-W2). Ce n'est pas une cle etrangere : Le Mur est un document CRDT, pas
 * une table.
 */
@Entity('tasks')
export class TaskEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'column_id', type: 'uuid' })
  columnId!: string;

  @Column({ type: 'varchar', length: 120 })
  title!: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  details!: string | null;

  /** R-K5 : plusieurs assignes possibles, d'ou une table de jointure. */
  @ManyToMany(() => UserEntity, { eager: true })
  @JoinTable({
    name: 'task_assignees',
    joinColumn: { name: 'task_id' },
    inverseJoinColumn: { name: 'user_id' },
  })
  assignees!: UserEntity[];

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'position', type: 'int' })
  order!: number;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'wall_origin_id', type: 'text', nullable: true })
  wallOriginId!: string | null;
}
