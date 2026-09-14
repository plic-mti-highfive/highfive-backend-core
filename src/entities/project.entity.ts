import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  Participation,
  ProjectState,
  Visibility,
} from '../contracts/index.js';
import { TagEntity } from './tag.entity.js';
import { UserEntity } from './user.entity.js';
import { NeedEntity } from './need.entity.js';

/**
 * Projet (doc 04 §3). Deux axes independants, jamais fondus en un seul enum :
 * `visibility` (qui voit) et `participation` (comment on rejoint).
 *
 * R-PR1 : `visibility = private` impose `participation = on_invite`. La regle
 * est portee par le schema zod du contrat *et* revalidee apres fusion du corps
 * partiel avec l'etat courant (SPEC.md §3 "Projets") — sans quoi elle serait
 * contournable en deux `PATCH`.
 *
 * `highfiveCount` est un cache recalcule a chaque give/withdraw, jamais accepte
 * en entree (R-PR8/R-X2).
 */
@Entity('projects')
@Index(['visibility', 'state', 'lastActivityAt'])
export class ProjectEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug!: string;

  @Index()
  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'owner_id' })
  owner!: UserEntity;

  @Column({ type: 'varchar', length: 70 })
  title!: string;

  @Column({ type: 'varchar', length: 140 })
  tagline!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToMany(() => TagEntity, { eager: true })
  @JoinTable({
    name: 'project_tags',
    joinColumn: { name: 'project_id' },
    inverseJoinColumn: { name: 'tag_id' },
  })
  tags!: TagEntity[];

  /*
   * Pas de cascade : les besoins sont ecrits explicitement (creation en bloc,
   * remplacement en bloc). Avec la cascade, enregistrer le projet apres avoir
   * remplace ses besoins faisait reecrire par TypeORM les lignes deja
   * supprimees, avec un `project_id` nul.
   */
  @OneToMany(() => NeedEntity, (need) => need.project, { eager: true })
  needs!: NeedEntity[];

  @Column({ type: 'varchar', length: 16, default: 'public' })
  visibility!: Visibility;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  participation!: Participation;

  @Column({ type: 'varchar', length: 16, default: 'draft' })
  state!: ProjectState;

  @Column({ name: 'highfive_count', type: 'int', default: 0 })
  highfiveCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  /**
   * Mis a jour a toute ecriture dans Le Lab ou sur la fiche (SPEC.md §2.1).
   * Alimente le tri `sort=active` et l'archivage automatique R-PR6.
   */
  @Column({
    name: 'last_activity_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastActivityAt!: Date;

  /** R-X3 : suppression differee 30 jours, jamais un DELETE immediat. */
  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
