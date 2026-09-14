import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Commentaire (doc 04 §9). R-C4 : un seul niveau de reponse — un `parentId`
 * qui designerait un commentaire deja repondu est refuse a l'ecriture, ce que
 * l'integrite referentielle seule ne saurait exprimer.
 *
 * R-C3 : masquer positionne `hidden` (porteur/co-porteur ou administration) ;
 * seule l'administration supprime reellement.
 */
@Entity('comments')
@Index(['projectId', 'publishedAt'])
export class CommentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'varchar', length: 1000 })
  body!: string;

  @Column({ name: 'parent_id', type: 'uuid', nullable: true })
  parentId!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', default: () => 'now()' })
  publishedAt!: Date;

  @Column({ type: 'boolean', default: false })
  hidden!: boolean;
}
