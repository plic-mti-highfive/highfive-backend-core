import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { MessageAttachment } from '../contracts/index.js';

/**
 * Message (doc 04 §13).
 *
 * R-MSG4/R-MSG8 : la piece jointe est a plat (type + identifiant) plutot
 * qu'en JSON, pour que l'apercu se resolve par jointure. La contrainte
 * garantit qu'un type annonce porte bien son identifiant, et lui seul.
 *
 * R-MSG6 : supprimer positionne `deleted` et vide `body` — jamais de
 * `DELETE`, pour que le fil reste coherent (« Message supprime »).
 */
@Entity('messages')
@Index(['conversationId', 'sentAt'])
// Sans nom explicite : TypeORM ne compare les CHECK que par leur nom, et en
// derive un de l'expression. Une regle modifiee change donc de nom, et la
// synchronisation (ou une migration generee) remplace bien l'ancienne.
@Check(
  `CASE attachment_kind
     WHEN 'project' THEN attachment_project_id IS NOT NULL
     WHEN 'file' THEN attachment_file_id IS NOT NULL
     WHEN 'upload' THEN attachment_upload_id IS NOT NULL
   END IS NOT FALSE
   AND num_nonnulls(attachment_project_id, attachment_file_id, attachment_upload_id)
     = CASE WHEN attachment_kind IS NULL THEN 0 ELSE 1 END`,
)
export class MessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @Column({ name: 'author_id', type: 'uuid' })
  authorId!: string;

  @Column({ type: 'varchar', length: 4000 })
  body!: string;

  @Column({
    name: 'attachment_kind',
    type: 'varchar',
    length: 16,
    nullable: true,
  })
  attachmentKind!: MessageAttachment['kind'] | null;

  @Column({ name: 'attachment_project_id', type: 'uuid', nullable: true })
  attachmentProjectId!: string | null;

  @Column({ name: 'attachment_file_id', type: 'uuid', nullable: true })
  attachmentFileId!: string | null;

  /** R-MSG8 : unique — un depot ne se joint qu'a un seul message. */
  @Index({ unique: true })
  @Column({ name: 'attachment_upload_id', type: 'uuid', nullable: true })
  attachmentUploadId!: string | null;

  /** A la milliseconde : c'est la cle du curseur de pagination. */
  @Column({
    name: 'sent_at',
    type: 'timestamptz',
    precision: 3,
    default: () => 'now()',
  })
  sentAt!: Date;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt!: Date | null;

  @Column({ type: 'boolean', default: false })
  deleted!: boolean;
}
