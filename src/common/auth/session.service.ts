import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { LessThan, Repository } from 'typeorm';
import { SessionEntity, UserEntity } from '../../entities/index.js';

/**
 * Sessions porteur (SPEC.md §1.2).
 *
 * Jeton opaque plutot que JWT : la deconnexion doit reellement invalider le
 * jeton cote serveur, ce qu'un JWT autoportant ne permet pas sans liste de
 * revocation — laquelle reviendrait a cette table. Seul le hachage du jeton
 * est stocke.
 */
@Injectable()
export class SessionService {
  private readonly ttlMs: number;
  private readonly pepper: string;

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    config: ConfigService,
  ) {
    this.ttlMs =
      config.get<number>('session.ttlDays', 30) * 24 * 60 * 60 * 1000;
    this.pepper = config.get<string>('session.tokenPepper')!;
  }

  hash(token: string): string {
    return createHash('sha256').update(`${this.pepper}:${token}`).digest('hex');
  }

  async create(userId: string): Promise<string> {
    const token = randomBytes(32).toString('base64url');
    await this.sessions.save(
      this.sessions.create({
        tokenHash: this.hash(token),
        userId,
        expiresAt: new Date(Date.now() + this.ttlMs),
      }),
    );
    return token;
  }

  /** Resout un jeton vers la personne, ou `null` si expire/inconnu/supprime. */
  async resolve(token: string): Promise<UserEntity | null> {
    const session = await this.sessions.findOne({
      where: { tokenHash: this.hash(token) },
    });
    if (!session) return null;

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.sessions.delete({ tokenHash: session.tokenHash });
      return null;
    }

    const user = await this.users.findOne({ where: { id: session.userId } });
    if (!user || user.deletedAt || user.accountStatus === 'deleted') {
      return null;
    }
    return user;
  }

  async revoke(token: string): Promise<void> {
    await this.sessions.delete({ tokenHash: this.hash(token) });
  }

  /** Utilise a la suspension/suppression d'un compte : toutes ses sessions tombent. */
  async revokeAllFor(userId: string): Promise<void> {
    await this.sessions.delete({ userId });
  }

  async purgeExpired(): Promise<void> {
    await this.sessions.delete({ expiresAt: LessThan(new Date()) });
  }
}
