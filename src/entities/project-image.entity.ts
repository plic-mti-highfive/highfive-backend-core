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
 * Image de personnalisation d'une fiche (banniere ou galerie), deposee avant
 * d'etre referencee par `projects.customization` (docs/PERSONNALISATION.md).
 * Le contenu vit dans le stockage objet, sous un prefixe prive : il ne se lit
 * que par URL signee, y compris pour un projet public — un projet qui passe
 * prive ne laisse ainsi aucune image lisible a une adresse publique.
 *
 * `attachedAt` est nul tant qu'aucun enregistrement de la personnalisation ne
 * reference l'image : passe 24 h, l'entretien periodique la purge. Une image
 * qui cesse d'etre referencee est supprimee a l'enregistrement meme.
 */
@Entity('project_images')
@Index('ix_project_images_pending', ['uploadedAt'], {
  where: 'attached_at IS NULL',
})
export class ProjectImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @ManyToOne(() => ProjectEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: ProjectEntity;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  /** Type reel, detecte a la reception (JPEG, PNG, WebP ou AVIF). */
  @Column({ name: 'mime_type', type: 'varchar', length: 32 })
  mimeType!: string;

  /** 2 Mo au plus : un `int` suffit. */
  @Column({ type: 'int' })
  size!: number;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  /** Variante WebP de 640 px de large au plus, pour les cartes de projet. */
  @Column({ name: 'thumb_key', type: 'text' })
  thumbKey!: string;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt!: Date;

  @Column({ name: 'attached_at', type: 'timestamptz', nullable: true })
  attachedAt!: Date | null;
}
