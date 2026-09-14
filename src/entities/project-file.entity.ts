import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Fichier depose sur un projet (doc 04 §12). Le contenu vit dans le stockage
 * objet ; `storageKey` y renvoie. R-F1 : 20 Mo par fichier, 200 Mo par projet,
 * verifies avant l'ecriture objet.
 */
@Entity('project_files')
export class ProjectFileEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'bigint' })
  size!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 255 })
  mimeType!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt!: Date;
}
