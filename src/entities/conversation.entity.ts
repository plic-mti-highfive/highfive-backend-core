import { Check, Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ConversationType } from '../contracts/index.js';

/**
 * Nature de la messagerie : `messaging` (directes, groupes, canal d'equipe
 * exposes par `/conversations`) ou `wall` (chat du Mur d'un projet, expose
 * par le seul canvas). Interne : absent du contrat, jamais renvoye par l'API.
 */
export type ConversationKind = 'messaging' | 'wall';

/**
 * Conversation (doc 04 §13). Les participants vivent dans
 * `conversation_participants` : le `participantIds[]` du contrat est une forme
 * d'API, recalculee a la lecture.
 *
 * R-MSG1 : `direct_key` (les deux identifiants tries, joints par `:`) rend
 * unique la conversation directe entre deux personnes — ecrire a quelqu'un
 * qu'on a deja contacte reprend le fil au lieu d'en ouvrir un second.
 * R-MSG3 : un canal par projet au plus, garanti par l'index partiel.
 * Chat du Mur : une conversation `wall` par projet au plus (`type = 'channel'`
 * pour satisfaire le CHECK du projet, mais `kind = 'wall'` : elle n'est ni le
 * canal d'equipe, ni visible dans la messagerie).
 */
@Entity('conversations')
@Index('uq_conversations_channel_project', ['projectId'], {
  unique: true,
  where: "type = 'channel' AND kind = 'messaging'",
})
@Index('uq_conversations_wall_project', ['projectId'], {
  unique: true,
  where: "kind = 'wall'",
})
// Sans nom explicite : voir `message.entity.ts`.
@Check(
  "(type = 'channel') = (project_id IS NOT NULL) AND (type = 'direct') = (direct_key IS NOT NULL) AND (kind = 'messaging' OR type = 'channel')",
)
export class ConversationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 16 })
  type!: ConversationType;

  @Column({ type: 'varchar', length: 16, default: 'messaging' })
  kind!: ConversationKind;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  title!: string | null;

  /**
   * R-MSG9 : administrateur d'un groupe — son createur, puis le plus ancien
   * participant restant. Sans contrainte en base : les groupes anterieurs a
   * la regle n'en ont pas, et la lecture retombe alors sur le plus ancien.
   */
  @Column({ name: 'admin_id', type: 'uuid', nullable: true })
  adminId!: string | null;

  @Index({ unique: true })
  @Column({ name: 'direct_key', type: 'varchar', length: 73, nullable: true })
  directKey!: string | null;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  /**
   * Date du dernier message, ou de la creation tant qu'il n'y en a aucun.
   * Cache de tri de la liste (R-X2 : jamais expose ni accepte en entree) ;
   * l'agreger sur `messages` a chaque lecture couterait un balayage par
   * conversation.
   */
  @Column({
    name: 'last_activity_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastActivityAt!: Date;
}
