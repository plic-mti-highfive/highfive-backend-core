import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Project } from '../../project-execution/projects/entities/project.entity.js';

/**
 * Un canvas de brainstorming rattache a un projet.
 *
 * Le canvas est materialise ici (et non dans le service canvas) parce que c'est
 * le core qui detient les droits projet : il doit pouvoir dire qui a le droit
 * d'ouvrir quel canvas avant d'emettre un token. Le contenu, lui, vit dans le
 * document Yjs cote serveur canvas — cette table ne stocke que l'identite.
 *
 * Un projet peut en porter plusieurs, d'ou le canvasId distinct du projectId
 * dans CanvasTokenPayload.
 */
@Entity('canvases')
@Index(['tenantId', 'projectId'])
export class Canvas {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({ name: 'project_id' })
  projectId!: string;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @Column({ default: 'Brainstorming' })
  name!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
