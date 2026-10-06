import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * R-MSG8 : image, video ou fichier depose dans une conversation, avant d'etre
 * joint a un message (`messages.attachment_upload_id`). Le contenu vit dans le
 * stockage objet, sous un prefixe prive : il ne se lit que par URL signee.
 *
 * Un depot qu'aucun message ne reference apres 24 h est purge par
 * l'entretien periodique — c'est le prix du depot en deux temps, qui garde
 * l'envoi du message en JSON valide par zod.
 */
@Entity('message_uploads')
export class MessageUploadEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'conversation_id', type: 'uuid' })
  conversationId!: string;

  @Column({ name: 'uploaded_by', type: 'uuid' })
  uploadedBy!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ type: 'bigint' })
  size!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 255 })
  mimeType!: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  /** La purge des depots orphelins part de la date. */
  @Index()
  @Column({ name: 'uploaded_at', type: 'timestamptz', default: () => 'now()' })
  uploadedAt!: Date;
}
