import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Annonce (doc 04 §9). R-A2 : une seule epinglee par projet — l'index unique
 * partiel l'impose, donc epingler doit depingler l'ancienne dans la meme
 * transaction plutot que de compter sur une simple mise a jour.
 */
@Entity('announcements')
@Index('uq_announcements_single_pinned', ['projectId'], {
  unique: true,
  where: 'pinned = true',
})
export class AnnouncementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'varchar', length: 80 })
  title!: string;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'boolean', default: false })
  pinned!: boolean;

  @Column({ name: 'published_at', type: 'timestamptz', default: () => 'now()' })
  publishedAt!: Date;
}
