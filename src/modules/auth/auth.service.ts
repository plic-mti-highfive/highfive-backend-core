import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'node:crypto';
import { Repository } from 'typeorm';
import type {
  LoginInput,
  PasswordResetInput,
  PasswordResetRequestInput,
  RegisterInput,
  Session,
} from '../../contracts/index.js';
import { PasswordResetTokenEntity, UserEntity } from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import { SessionService } from '../../common/auth/session.service.js';
import { toCurrentUser } from '../../common/mappers/index.js';
import { AiEventsService } from '../../common/ai/ai-events.service.js';

/** Duree de validite d'un lien de reinitialisation. */
const RESET_TTL_MS = 60 * 60 * 1000;

/** Avatar par defaut : deterministe, pour que le meme pseudo ait toujours le meme visage. */
const defaultAvatar = (username: string): string =>
  `https://api.dicebear.com/9.x/glass/svg?seed=${encodeURIComponent(username)}`;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(PasswordResetTokenEntity)
    private readonly resetTokens: Repository<PasswordResetTokenEntity>,
    private readonly sessions: SessionService,
    private readonly ai: AiEventsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Le role plateforme ne s'obtient par aucune route : il se declare dans
   * `ADMIN_EMAILS`. On le relit a l'inscription, et pas seulement au demarrage,
   * pour qu'un compte d'administration cree apres coup ait son role tout de
   * suite plutot qu'au prochain redemarrage.
   */
  private platformRoleFor(email: string): 'member' | 'admin' {
    const admins = (this.config.get<string>('adminEmails') ?? '')
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean);
    return admins.includes(email) ? 'admin' : 'member';
  }

  async login(input: LoginInput): Promise<Session> {
    const user = await this.users.findOne({
      where: { email: input.email.toLowerCase() },
    });

    // Message unique quel que soit le motif : distinguer « compte inconnu » de
    // « mot de passe faux » renseignerait un attaquant sur les adresses
    // enregistrees.
    const invalid = ApiError.unauthorized('Adresse ou mot de passe incorrect.');
    if (!user || user.deletedAt || user.accountStatus === 'deleted') {
      throw invalid;
    }
    if (!(await argon2.verify(user.passwordHash, input.password))) {
      throw invalid;
    }

    user.lastVisitAt = new Date();
    await this.users.save(user);

    return {
      user: toCurrentUser(user),
      token: await this.sessions.create(user.id),
    };
  }

  async register(input: RegisterInput): Promise<Session> {
    const email = input.email.toLowerCase();

    if (await this.users.findOne({ where: { email } })) {
      throw ApiError.conflict('Cette adresse est deja utilisee.');
    }
    if (await this.users.findOne({ where: { username: input.username } })) {
      throw ApiError.conflict('Ce pseudo est deja pris.');
    }

    const user = await this.users.save(
      this.users.create({
        username: input.username,
        displayName: input.displayName ?? null,
        email,
        avatarUrl: defaultAvatar(input.username),
        bio: null,
        interests: [],
        accountStatus: 'active',
        platformRole: this.platformRoleFor(email),
        passwordHash: await argon2.hash(input.password),
        lastVisitAt: new Date(),
      }),
    );

    await this.ai.userIdentityChanged({
      userId: user.id,
      bio: null,
      interests: [],
    });

    return {
      user: toCurrentUser(user),
      token: await this.sessions.create(user.id),
    };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.sessions.revoke(token);
  }

  /**
   * Repond toujours sans rien reveler : meme reponse, meme travail apparent,
   * que l'adresse existe ou non. C'est la seule facon d'empecher d'enumerer
   * les comptes par cette route.
   */
  async requestPasswordReset(input: PasswordResetRequestInput): Promise<void> {
    const user = await this.users.findOne({
      where: { email: input.email.toLowerCase() },
    });
    if (!user || user.deletedAt) return;

    const token = randomBytes(32).toString('base64url');
    await this.resetTokens.save(
      this.resetTokens.create({
        tokenHash: hashToken(token),
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      }),
    );

    // L'envoi du courriel n'est pas cable : la plateforme n'a pas encore de
    // service d'envoi. Le jeton est journalise en developpement pour que le
    // parcours reste testable de bout en bout.
    this.logger.debug(
      `Lien de reinitialisation pour ${user.email} : token=${token}`,
    );
  }

  async resetPassword(input: PasswordResetInput): Promise<void> {
    const row = await this.resetTokens.findOne({
      where: { tokenHash: hashToken(input.token) },
    });

    if (!row || row.usedAt || row.expiresAt.getTime() <= Date.now()) {
      throw ApiError.validation(
        "Ce lien de reinitialisation n'est plus valable.",
      );
    }

    const user = await this.users.findOne({ where: { id: row.userId } });
    if (!user) throw ApiError.validation("Ce lien n'est plus valable.");

    user.passwordHash = await argon2.hash(input.password);
    await this.users.save(user);

    row.usedAt = new Date();
    await this.resetTokens.save(row);

    // Changer de mot de passe ferme les sessions ouvertes ailleurs : c'est
    // precisement ce qu'on attend apres un vol de compte.
    await this.sessions.revokeAllFor(user.id);
  }
}

const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
