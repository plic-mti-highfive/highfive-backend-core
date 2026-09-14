import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Session porteur (SPEC.md §1.2). Le mock du front gardait une `Map` sans
 * expiration ; ici le jeton expire et n'est jamais stocke en clair — seul son
 * hachage l'est, de sorte qu'une fuite de la base ne donne pas de sessions
 * utilisables. `POST /auth/logout` supprime la ligne.
 */
@Entity('sessions')
export class SessionEntity {
  @PrimaryColumn({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;
}
