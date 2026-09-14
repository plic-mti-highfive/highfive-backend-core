import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { UserEntity } from '../../entities/index.js';

/**
 * Promotion des comptes d'administration listes dans `ADMIN_EMAILS`.
 *
 * Aucune route ne donne le role `admin` — et c'est voulu : un role plateforme
 * ne doit pas pouvoir s'obtenir par l'API, meme par un autre administrateur.
 * Sans ce mecanisme, le premier administrateur n'existerait jamais, et l'espace
 * de moderation serait inaccessible sur une base neuve.
 *
 * La liste fait autorite dans les deux sens : un compte retire de
 * `ADMIN_EMAILS` redevient membre au redemarrage. On evite ainsi qu'une
 * promotion faite un jour survive indefiniment a la configuration.
 */
@Injectable()
export class AdminBootstrapService implements OnModuleInit {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    const emails = (this.config.get<string>('adminEmails') ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (emails.length > 0) {
      const promoted = await this.users.update(
        { email: In(emails), platformRole: 'member' },
        { platformRole: 'admin' },
      );
      if (promoted.affected) {
        this.logger.log(
          `${promoted.affected} compte(s) promu(s) administrateur.`,
        );
      }
    }

    // Retrograde ce qui ne figure plus dans la liste. `Not(In([]))` ne
    // s'exprimant pas en SQL, le cas de la liste vide est traite a part.
    const demoted =
      emails.length > 0
        ? await this.users
            .createQueryBuilder()
            .update(UserEntity)
            .set({ platformRole: 'member' })
            .where('platform_role = :role', { role: 'admin' })
            .andWhere('LOWER(email) NOT IN (:...emails)', { emails })
            .execute()
        : await this.users.update(
            { platformRole: 'admin' },
            { platformRole: 'member' },
          );

    if (demoted.affected) {
      this.logger.log(
        `${demoted.affected} compte(s) retrograde(s) : absent(s) de ADMIN_EMAILS.`,
      );
    }
  }
}
