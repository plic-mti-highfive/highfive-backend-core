import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import {
  InvitationEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { SessionService } from '../../common/auth/session.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** R-PR6 : un projet sans activite depuis 180 jours s'archive tout seul. */
const ARCHIVE_AFTER_MS = 180 * DAY_MS;

/** Le porteur est prevenu 14 jours avant, pour avoir le temps de reagir. */
const ARCHIVE_WARNING_MS = ARCHIVE_AFTER_MS - 14 * DAY_MS;

/** R-X3 : 30 jours de retention avant purge definitive. */
const PURGE_AFTER_MS = 30 * DAY_MS;

const RUN_EVERY_MS = 6 * 60 * 60 * 1000;

/**
 * Travaux d'entretien periodiques.
 *
 * Un simple intervalle plutot qu'un ordonnanceur : ces taches sont
 * idempotentes et tolerent d'etre rejouees ou manquees. Le jour ou plusieurs
 * instances tourneront en parallele, il faudra un verrou — pour l'instant,
 * rejouer un archivage deja fait ne change rien.
 */
@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MaintenanceService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(InvitationEntity)
    private readonly invitations: Repository<InvitationEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly sessions: SessionService,
    private readonly notifications: NotificationsService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.run(), RUN_EVERY_MS);
    // `unref` : ces travaux ne doivent pas empecher le processus de s'arreter.
    this.timer.unref();
    void this.run();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async run(): Promise<void> {
    try {
      await this.sessions.purgeExpired();
      await this.expireInvitations();
      await this.warnBeforeArchive();
      await this.archiveInactive();
      await this.purgeDeleted();
    } catch (error) {
      this.logger.error(`Entretien periodique en echec: ${String(error)}`);
    }
  }

  /** R-I1 : une invitation passee de date devient `expired`. */
  private async expireInvitations(): Promise<void> {
    await this.invitations.update(
      { status: 'pending', expiresAt: LessThan(new Date()) },
      { status: 'expired' },
    );
  }

  private async warnBeforeArchive(): Promise<void> {
    const from = new Date(Date.now() - ARCHIVE_AFTER_MS);
    const to = new Date(Date.now() - ARCHIVE_WARNING_MS);

    const candidates = await this.projects
      .createQueryBuilder('project')
      .where('project.deletedAt IS NULL')
      .andWhere("project.state = 'active'")
      .andWhere('project.lastActivityAt BETWEEN :from AND :to', { from, to })
      .getMany();

    for (const project of candidates) {
      // Le regroupement des notifications evite d'en emettre une par passage :
      // tant que la precedente n'est pas lue, elle est simplement rafraichie.
      await this.notifications.notify({
        recipientId: project.ownerId,
        // Aucun compte systeme n'existe : la decision vient de la plateforme,
        // l'acteur affiche est donc le porteur lui-meme.
        actorId: project.ownerId,
        allowSelf: true,
        type: 'admin_decision',
        targetType: 'project',
        targetId: project.id,
      });
    }
  }

  private async archiveInactive(): Promise<void> {
    const result = await this.projects.update(
      {
        state: 'active',
        lastActivityAt: LessThan(new Date(Date.now() - ARCHIVE_AFTER_MS)),
      },
      { state: 'archived' },
    );

    if (result.affected) {
      this.logger.log(
        `${result.affected} projet(s) archive(s) pour inactivite.`,
      );
    }
  }

  /** R-X3/R-P2 : purge apres 30 jours ; un compte est anonymise, pas efface. */
  private async purgeDeleted(): Promise<void> {
    const threshold = new Date(Date.now() - PURGE_AFTER_MS);

    await this.projects.delete({ deletedAt: LessThan(threshold) });

    const users = await this.users.find({
      where: { deletedAt: LessThan(threshold) },
    });
    for (const user of users) {
      if (user.accountStatus === 'deleted' && user.email === '') continue;

      user.accountStatus = 'deleted';
      // L'unicite du pseudo doit survivre a l'anonymisation, d'ou le suffixe.
      user.username = `compte-supprime-${user.id.slice(0, 8)}`;
      user.displayName = null;
      user.bio = null;
      user.email = '';
      user.passwordHash = '';
      user.interests = [];
      await this.users.save(user);
    }
  }
}
