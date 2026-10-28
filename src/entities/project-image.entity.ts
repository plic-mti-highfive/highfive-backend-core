import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Image de personnalisation d'une fiche (banniere ou galerie), televersee avant
 * d'etre referencee par `projects.customization`. Le contenu vit sous un
 * prefixe prive du stockage (R-V3 : l'URL d'un projet prive ne doit pas etre
 * publique) et ne se lit que par URL signee.
 *
 * Une image qu'aucune personnalisation ne reference apres 24 h est purgee par
 * l'entretien periodique.
 */
@Entity('project_images')
export class ProjectImageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 64 })
  mimeType!: string;

  @Column({ type: 'int' })
  size!: number;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Index()
  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt!: Date;
}
