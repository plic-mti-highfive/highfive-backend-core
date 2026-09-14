import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Le Mur d'un projet (doc 04 §10, V2-10) : une ligne par projet, creee avec
 * lui.
 *
 * Le document collaboratif lui-meme n'est pas ici — il vit dans le service
 * canvas (Yjs/Hocuspocus, stockage S3). Cette table ne porte que ce que le
 * core doit connaitre pour autoriser l'acces : l'identite du document
 * (`canvasId`, le nom du document Hocuspocus) et l'apercu.
 *
 * C'est le core qui detient les droits projet : c'est donc lui, et lui seul,
 * qui emet le jeton d'acces au document.
 */
@Entity('walls')
export class WallEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  /** Nom du document cote Hocuspocus. Distinct du projet : un document peut
   *  etre remplace (repartir d'un Mur vierge) sans changer de projet. */
  @Column({ name: 'canvas_id', type: 'uuid' })
  canvasId!: string;

  @Column({ name: 'snapshot_url', type: 'text', nullable: true })
  snapshotUrl!: string | null;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
