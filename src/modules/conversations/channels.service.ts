import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import {
  PROJECT_DELETED,
  PROJECT_TEAM_CHANGED,
  type ProjectEvent,
} from '../../common/events/project-events.js';
import {
  ConversationEntity,
  type ConversationKind,
  ConversationParticipantEntity,
  MembershipEntity,
  ProjectEntity,
} from '../../entities/index.js';
import { StorageService } from '../../common/storage/storage.service.js';
import { deleteConversation } from './delete-conversation.js';

/**
 * R-MSG3 : le canal d'un projet est le miroir exact de son equipe — ses
 * participants sont les appartenances non bloquees, ni plus ni moins.
 *
 * Plutot que d'appliquer chaque changement (ajouter Alice, retirer Bob), on
 * resynchronise tout le canal a partir des appartenances : le meme code sert
 * a chaque evenement, a la creation, et au rattrapage periodique. Rejouer
 * une synchronisation ne change rien, en manquer une se rattrape au passage
 * suivant de l'entretien.
 *
 * La conversation `wall` du projet (chat du Mur, `kind = 'wall'`) suit la
 * meme regle : meme equipe, memes synchronisations, mais jamais exposee par
 * les routes de la messagerie.
 */
@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
  ) {}

  @OnEvent(PROJECT_TEAM_CHANGED)
  async onTeamChanged({ projectId }: ProjectEvent): Promise<void> {
    await this.sync(projectId);
  }

  @OnEvent(PROJECT_DELETED)
  async onProjectDeleted({ projectId }: ProjectEvent): Promise<void> {
    await this.remove(projectId);
  }

  /**
   * Cree le canal s'il manque, puis aligne ses participants sur l'equipe.
   * Qui arrive voit tout l'historique, mais sa lecture part de son arrivee :
   * rejoindre une equipe active ne doit pas afficher des centaines de non
   * lus.
   */
  async sync(projectId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const project = await manager.findOne(ProjectEntity, {
        where: { id: projectId, deletedAt: IsNull() },
      });
      if (!project) return;
      await this.syncConversation(manager, projectId, 'messaging');
      await this.syncConversation(manager, projectId, 'wall');
    });
  }

  /**
   * Identifiant de la conversation `wall` du projet (creee et alignee sur
   * l'equipe si elle manque), ou `undefined` si le projet n'existe plus.
   * Chemin rapide : une lecture quand elle existe deja.
   */
  async wallConversationId(projectId: string): Promise<string | undefined> {
    const existing = await this.dataSource
      .getRepository(ConversationEntity)
      .findOne({
        select: { id: true },
        where: { kind: 'wall', projectId },
      });
    if (existing) return existing.id;
    await this.dataSource.transaction(async (manager) => {
      const project = await manager.findOne(ProjectEntity, {
        where: { id: projectId, deletedAt: IsNull() },
      });
      if (project) await this.syncConversation(manager, projectId, 'wall');
    });
    return (
      await this.dataSource.getRepository(ConversationEntity).findOne({
        select: { id: true },
        where: { kind: 'wall', projectId },
      })
    )?.id;
  }

  private async syncConversation(
    manager: EntityManager,
    projectId: string,
    kind: ConversationKind,
  ): Promise<void> {
    // `ON CONFLICT DO NOTHING` puis relecture : deux synchronisations
    // simultanees du meme projet aboutissent au meme canal.
    await manager
      .createQueryBuilder()
      .insert()
      .into(ConversationEntity)
      .values({ type: 'channel', kind, projectId })
      .orIgnore()
      .execute();
    const channel = (await manager.findOne(ConversationEntity, {
      where: { type: 'channel', kind, projectId },
    }))!;

    const [team, participants] = await Promise.all([
      manager.find(MembershipEntity, {
        where: { projectId, blocked: false },
      }),
      manager.find(ConversationParticipantEntity, {
        where: { conversationId: channel.id },
      }),
    ]);
    const teamIds = new Set(team.map((membership) => membership.userId));
    const currentIds = new Set(participants.map((row) => row.userId));

    const arrivals = [...teamIds].filter((id) => !currentIds.has(id));
    const departures = [...currentIds].filter((id) => !teamIds.has(id));

    if (arrivals.length) {
      const now = new Date();
      await manager
        .createQueryBuilder()
        .insert()
        .into(ConversationParticipantEntity)
        .values(
          arrivals.map((userId) => ({
            conversationId: channel.id,
            userId,
            joinedAt: now,
            lastReadAt: now,
          })),
        )
        .orIgnore()
        .execute();
    }
    if (departures.length) {
      await manager.delete(ConversationParticipantEntity, {
        conversationId: channel.id,
        userId: In(departures),
      });
    }
  }

  /**
   * Le canal disparait avec son projet, messages et fichiers compris.
   * Les notifications qui y renvoyaient sont retirees : elles meneraient a
   * une conversation introuvable.
   */
  async remove(projectId: string): Promise<void> {
    const storageKeys = await this.dataSource.transaction(async (manager) => {
      // Canal d'equipe et chat du Mur : tout part avec le projet.
      const channels = await manager.find(ConversationEntity, {
        where: { type: 'channel', projectId },
      });
      const keys: string[] = [];
      for (const channel of channels) {
        keys.push(...(await deleteConversation(manager, channel.id)));
      }
      return keys;
    });
    for (const key of storageKeys) await this.storage.remove(key);
  }

  /**
   * Rattrapage periodique : cree les canaux des projets qui n'en ont pas
   * (projets anterieurs a la messagerie), realigne ceux qui ont derive, et
   * supprime ceux dont le projet n'existe plus.
   */
  async reconcileAll(): Promise<void> {
    const projects = await this.dataSource.getRepository(ProjectEntity).find({
      select: { id: true },
      where: { deletedAt: IsNull() },
    });
    for (const project of projects) await this.sync(project.id);

    const orphans = await this.dataSource
      .getRepository(ConversationEntity)
      .createQueryBuilder('c')
      .select('DISTINCT c.project_id', 'projectId')
      .where("c.type = 'channel'")
      .andWhere(
        'NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = c.project_id AND p.deleted_at IS NULL)',
      )
      .getRawMany<{ projectId: string }>();
    for (const orphan of orphans) await this.remove(orphan.projectId);

    if (orphans.length) {
      this.logger.log(`${orphans.length} canal(aux) sans projet supprime(s).`);
    }
  }
}
