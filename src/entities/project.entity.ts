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
  BannerFocal,
  CustomizationSection,
  Participation,
  ProjectState,
  ProjectTheme,
  Visibility,
} from '../contracts/index.js';
import { TagEntity } from './tag.entity.js';
import { UserEntity } from './user.entity.js';
import { NeedEntity } from './need.entity.js';

/**
 * Personnalisation telle qu'elle est enregistree : le contrat
 * `ProjectCustomization`, mais les images y sont referencees par leur id
 * dans `project_images`, sans URL. Les URL sont signees et expirent : elles
 * se calculent a la lecture, et l'URL envoyee par le client n'est jamais
 * conservee (on ne sert pas une adresse arbitraire).
 */
export type StoredCustomization = {
  banner?: { imageId: string; alt: string; focal: BannerFocal };
  theme?: ProjectTheme;
  sections: CustomizationSection[];
  gallery: { imageId: string; alt: string; caption?: string }[];
};

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

  /**
   * Personnalisation de la fiche, remplacee d'un bloc par
   * `PATCH /projects/:slug/customization`. `NULL` = fiche par defaut. Une
   * colonne plutot que des tables : le contrat ne lit ni n'ecrit jamais une
   * section seule, et la galerie est bornee a 8 images.
   */
  @Column({ type: 'jsonb', nullable: true })
  customization!: StoredCustomization | null;

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
