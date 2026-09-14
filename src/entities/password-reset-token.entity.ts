import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Jeton de reinitialisation a usage unique. Meme precaution que les sessions :
 * seul le hachage est stocke. `POST /auth/password-reset-request` repond
 * toujours 204, que le compte existe ou non.
 */
@Entity('password_reset_tokens')
export class PasswordResetTokenEntity {
  @PrimaryColumn({ name: 'token_hash', type: 'char', length: 64 })
  tokenHash!: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;
}
