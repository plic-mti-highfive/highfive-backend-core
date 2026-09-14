import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProjectEntity } from './project.entity.js';

/**
 * Besoin (doc 04 §4) : « ce que le projet cherche », jamais une offre d'emploi
 * (R-B1). Six au maximum par projet. Un besoin pourvu reste affiche barre
 * pendant 7 jours, puis disparait — filtre a la lecture via `fulfilledAt`,
 * ce qui evite un travail de purge planifie.
 */
@Entity('needs')
export class NeedEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => ProjectEntity, (project) => project.needs, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ type: 'varchar', length: 40 })
  label!: string;

  @Column({ name: 'tag_id', type: 'varchar', length: 40, nullable: true })
  tagId!: string | null;

  @Column({ type: 'boolean', default: false })
  fulfilled!: boolean;

  @Column({ name: 'fulfilled_at', type: 'timestamptz', nullable: true })
  fulfilledAt!: Date | null;
}
