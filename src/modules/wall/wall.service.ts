import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import type {
  MembershipRole,
  Task,
  Wall,
  WallToTasksInput,
} from '../../contracts/index.js';
import { ProjectEntity, UserEntity, WallEntity } from '../../entities/index.js';
import { toWall } from '../../common/mappers/index.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { TasksService } from '../tasks/tasks.service.js';
import { AiTasksService } from './ai-tasks.service.js';
import { CanvasClientService } from './canvas-client.service.js';
import type { CanvasTokenPayload, ProposedTask } from './canvas.types.js';

/** Les roles projet ne sont pas ceux du document : on projette les uns sur les autres. */
const CANVAS_ROLE: Record<MembershipRole, CanvasTokenPayload['role']> = {
  owner: 'admin',
  co_owner: 'admin',
  member: 'editor',
  observer: 'viewer',
};

export interface WallSession {
  canvasId: string;
  projectId: string;
  websocketUrl: string;
  token: string;
  role: CanvasTokenPayload['role'];
}

export interface WallSuggestions {
  tasks: ProposedTask[];
  /** Vrai quand Le Mur ne contient pas assez de matiere pour proposer quoi que ce soit. */
  empty: boolean;
}

@Injectable()
export class WallService {
  constructor(
    @InjectRepository(WallEntity)
    private readonly walls: Repository<WallEntity>,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly access: ProjectAccessService,
    private readonly tasks: TasksService,
    private readonly canvas: CanvasClientService,
    private readonly ai: AiTasksService,
  ) {}

  /**
   * R-W1/R-V6 : Le Mur n'est jamais public, meme sur un projet public. Un
   * visiteur sans appartenance est refuse, jamais suppose observateur.
   */
  async get(slug: string, user: UserEntity | undefined): Promise<Wall> {
    const { wall } = await this.wallFor(slug, user, 'observer');
    return toWall(wall);
  }

  /**
   * R-W2 : conversion d'elements du Mur en taches, dans la premiere colonne,
   * avec le lien vers l'origine (`wallOriginId`).
   *
   * Le titre vient du libelle envoye par le client : le Mur tourne en local
   * dans le navigateur, le service canvas n'a donc pas forcement connaissance
   * des elements selectionnes. Un libelle vide retombe sur un texte generique
   * plutot que de faire echouer la conversion — la personne renommera, elle
   * n'aura rien perdu.
   */
  async convertToTasks(
    slug: string,
    user: UserEntity,
    input: WallToTasksInput,
  ): Promise<Task[]> {
    const { project, wall } = await this.wallFor(slug, user, 'member');

    const items = input.elements.map((element, index) => {
      const label = element.label.trim();
      return {
        elementId: element.id,
        title: label ? label.slice(0, 120) : `Idee du Mur ${index + 1}`,
      };
    });

    await this.touchWall(wall);
    return this.tasks.createFromWall(user, project, items);
  }

  /**
   * Ouvre une session sur le document collaboratif : emet le jeton que le
   * client passera au serveur Hocuspocus.
   *
   * C'est ici que les droits projet deviennent des droits document : le
   * service canvas ne connait rien des projets, il ne sait que verifier ce
   * jeton. Appelee par le front (`useWallSync`) avant d'ouvrir le provider.
   */
  async openSession(slug: string, user: UserEntity): Promise<WallSession> {
    const { project, wall, role } = await this.wallFor(slug, user, 'observer');

    const payload: CanvasTokenPayload = {
      userId: user.id,
      projectId: project.id,
      canvasId: wall.canvasId,
      role: CANVAS_ROLE[role],
    };

    // Signe avec le secret du service canvas, distinct des sessions d'API :
    // ce sont deux publics differents.
    const token = await this.jwt.signAsync(
      { ...payload },
      {
        secret: this.config.get<string>('canvas.jwtSecret'),
        // `expiresIn` accepte une duree litterale (« 1h ») que le typage de
        // la bibliotheque exprime par un type de gabarit : la configuration,
        // elle, ne peut etre qu'une chaine.
        expiresIn: this.config.get<string>(
          'canvas.tokenExpiration',
        ) as `${number}h`,
      },
    );

    return {
      canvasId: wall.canvasId,
      projectId: project.id,
      websocketUrl: this.config.get<string>('canvas.websocketUrl')!,
      token,
      role: payload.role,
    };
  }

  /**
   * Propose des taches a partir du Mur, sans rien persister. Appelee par le
   * bouton « Suggerer des taches (IA) » du Mur.
   */
  async suggestTasks(slug: string, user: UserEntity): Promise<WallSuggestions> {
    const { project, wall } = await this.wallFor(slug, user, 'member');

    const exported = await this.canvas.fetchExport(wall.canvasId);
    if (!exported || !this.ai.hasEnoughMaterial(exported)) {
      return { tasks: [], empty: true };
    }

    const tasks = await this.ai.proposeTasks(
      { title: project.title, description: project.description },
      exported,
    );
    return { tasks, empty: tasks.length === 0 };
  }

  /** Cree les taches que la personne a retenues parmi les propositions. */
  async acceptSuggestedTasks(
    slug: string,
    user: UserEntity,
    proposals: ProposedTask[],
  ): Promise<Task[]> {
    const { project } = await this.wallFor(slug, user, 'member');

    return this.tasks.createFromWall(
      user,
      project,
      proposals.map((proposal, index) => ({
        elementId: proposal.sourceHints[0] ?? `suggestion-${index + 1}`,
        title: proposal.title.slice(0, 120),
      })),
    );
  }

  /** Le Mur d'un projet cree avant l'introduction de la table est cree a la volee. */
  private async wallFor(
    slug: string,
    user: UserEntity | undefined,
    minimum: MembershipRole,
  ): Promise<{
    project: ProjectEntity;
    wall: WallEntity;
    role: MembershipRole;
  }> {
    const project = await this.access.findBySlugOrFail(slug);
    const role = await this.access.assertRole(project, user, minimum);

    let wall = await this.walls.findOne({ where: { projectId: project.id } });
    if (!wall) {
      wall = await this.walls.save(
        this.walls.create({ projectId: project.id, canvasId: randomUUID() }),
      );
    }

    return { project, wall, role };
  }

  private async touchWall(wall: WallEntity): Promise<void> {
    await this.walls.update(
      { projectId: wall.projectId },
      { updatedAt: new Date() },
    );
    await this.access.touch(wall.projectId);
  }
}
