import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, IsNull, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import type {
  Paginated,
  Project,
  ProjectCreateInput,
  ProjectState,
  ProjectSummary,
  ProjectTransition,
  ProjectUpdateInput,
} from '../../contracts/index.js';
import { projectSchema } from '../../contracts/index.js';
import {
  ColumnEntity,
  MembershipEntity,
  NeedEntity,
  ProjectEntity,
  UserEntity,
  WallEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  clampLimit,
  decodeCursor,
  toPage,
} from '../../common/http/pagination.js';
import { toProject } from '../../common/mappers/index.js';
import { AiEventsService } from '../../common/ai/ai-events.service.js';
import {
  PROJECT_DELETED,
  PROJECT_TEAM_CHANGED,
} from '../../common/events/project-events.js';
import { ProjectAccessService } from './project-access.service.js';
import { TagsService } from '../tags/tags.service.js';
import { slugify } from './slug.js';

/** R-K1 : les trois colonnes creees avec chaque projet. */
const DEFAULT_COLUMNS = ['A faire', 'En cours', 'Fait'];

/** R-PR3..R-PR6 : matrice des transitions d'etat. */
const TRANSITIONS: Record<
  ProjectTransition,
  { from: ProjectState[]; to: ProjectState; ownerOnly: boolean }
> = {
  publish: { from: ['draft'], to: 'active', ownerOnly: true },
  complete: { from: ['active'], to: 'done', ownerOnly: false },
  reopen: { from: ['done'], to: 'active', ownerOnly: false },
  archive: {
    from: ['draft', 'active', 'done'],
    to: 'archived',
    ownerOnly: true,
  },
  reactivate: { from: ['archived'], to: 'active', ownerOnly: true },
};

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly dataSource: DataSource,
    private readonly access: ProjectAccessService,
    private readonly tags: TagsService,
    private readonly ai: AiEventsService,
    private readonly events: EventEmitter2,
  ) {}

  /** `GET /api/projects` — fil public (R-V1). */
  async listPublic(params: {
    q?: string;
    tags?: string[];
    participation?: string;
    sort?: 'recent' | 'popular' | 'relevant';
    cursor?: string;
    limit?: number;
  }): Promise<Paginated<ProjectSummary>> {
    const query = this.projects
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.tags', 'tag')
      .leftJoinAndSelect('project.needs', 'need')
      .where('project.deletedAt IS NULL')
      .andWhere('project.visibility = :visibility', { visibility: 'public' })
      .andWhere('project.state = :state', { state: 'active' });

    if (params.q) {
      query.andWhere('(project.title ILIKE :q OR project.tagline ILIKE :q)', {
        q: `%${params.q}%`,
      });
    }

    if (params.tags?.length) {
      // Filtre additif : au moins un theme en commun. La sous-requete evite de
      // dupliquer les lignes que la jointure d'affichage produirait.
      query.andWhere(
        `EXISTS (SELECT 1 FROM project_tags pt WHERE pt.project_id = project.id AND pt.tag_id IN (:...tagIds))`,
        { tagIds: params.tags },
      );
    }

    if (params.participation) {
      query.andWhere('project.participation = :participation', {
        participation: params.participation,
      });
    }

    switch (params.sort) {
      case 'popular':
        query.orderBy('project.highfiveCount', 'DESC');
        break;
      case 'recent':
        query.orderBy('project.createdAt', 'DESC');
        break;
      default:
        // `relevant` sans moteur de recherche plein texte ne veut rien dire de
        // plus que « le plus vivant » : on ne feint pas un score de pertinence.
        query.orderBy('project.lastActivityAt', 'DESC');
    }

    const offset = decodeCursor(params.cursor);
    const size = clampLimit(params.limit);
    const [rows, total] = await query.skip(offset).take(size).getManyAndCount();

    return toPage(await this.access.summarize(rows), total, offset);
  }

  /** `GET /api/me/projects` — tout ce dont la personne fait partie. */
  async listMine(userId: string): Promise<ProjectSummary[]> {
    const ids = await this.access.projectIdsOf(userId);
    if (ids.length === 0) return [];

    const rows = await this.projects.find({
      where: { id: In(ids), deletedAt: IsNull() },
      order: { lastActivityAt: 'DESC' },
    });
    return this.access.summarize(rows);
  }

  async getBySlug(
    slug: string,
    viewer: UserEntity | undefined,
  ): Promise<Project> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertCanView(project, viewer);
    return toProject(project);
  }

  async create(
    author: UserEntity,
    input: ProjectCreateInput,
  ): Promise<Project> {
    // R-P1 : un compte suspendu ne cree rien.
    if (author.accountStatus !== 'active') {
      throw ApiError.forbidden(
        'Ton compte est suspendu : tu ne peux pas creer de projet.',
      );
    }

    const tags = await this.tags.resolveOrFail(input.tags);
    const slug = await this.uniqueSlug(slugify(input.title));

    const project = await this.dataSource.transaction(async (manager) => {
      const created = await manager.save(
        manager.create(ProjectEntity, {
          slug,
          ownerId: author.id,
          title: input.title,
          tagline: input.tagline,
          description: input.description ?? null,
          tags,
          visibility: input.visibility,
          participation: input.participation,
          // R-PR3 : on ne publie pas par accident. Tout projet nait brouillon.
          state: 'draft',
          highfiveCount: 0,
          lastActivityAt: new Date(),
        }),
      );

      if (input.needs?.length) {
        await manager.save(
          input.needs.map((need) =>
            manager.create(NeedEntity, {
              projectId: created.id,
              label: need.label,
              tagId: need.tagId ?? null,
              fulfilled: false,
            }),
          ),
        );
      }

      // R-M1 : l'appartenance du porteur nait avec le projet, dans la meme
      // transaction — un projet sans porteur ne doit jamais exister.
      await manager.save(
        manager.create(MembershipEntity, {
          projectId: created.id,
          userId: author.id,
          role: 'owner',
        }),
      );

      // R-K1 : les trois colonnes par defaut.
      await manager.save(
        DEFAULT_COLUMNS.map((label, index) =>
          manager.create(ColumnEntity, {
            projectId: created.id,
            label,
            order: index,
          }),
        ),
      );

      // Le Mur existe des la creation : son document cote service canvas est
      // cree au premier acces, mais son identite est fixee ici.
      await manager.save(
        manager.create(WallEntity, {
          projectId: created.id,
          canvasId: randomUUID(),
        }),
      );

      return created;
    });

    // R-MSG3 : le canal nait avec le projet (le porteur seul, pour l'instant).
    await this.events.emitAsync(PROJECT_TEAM_CHANGED, {
      projectId: project.id,
    });

    const full = await this.access.findByIdOrFail(project.id);
    await this.ai.projectIdentityChanged({
      projectId: full.id,
      title: full.title,
      description: full.description,
      tags: full.tags.map((tag) => tag.id),
      visibility: full.visibility,
    });

    return toProject(full);
  }

  async update(
    slug: string,
    user: UserEntity,
    input: ProjectUpdateInput,
  ): Promise<Project> {
    const project = await this.access.findBySlugOrFail(slug);
    await this.access.assertRole(project, user, 'co_owner');

    /*
     * R-PR1 est revalidee sur l'etat resultant, pas seulement sur le corps
     * recu : sans cela, passer un projet ouvert en prive en deux requetes
     * (`{visibility}` puis rien) contournerait la regle.
     */
    const visibility = input.visibility ?? project.visibility;
    const participation = input.participation ?? project.participation;
    if (visibility === 'private' && participation !== 'on_invite') {
      throw ApiError.unprocessable(
        'Un projet prive ne se rejoint que sur invitation : change aussi la facon de rejoindre.',
      );
    }

    /*
     * Les colonnes simples passent par un `update` cible, et chaque relation
     * est ecrite separement. Enregistrer l'entite entiere reviendrait a
     * soumettre a l'ORM des relations chargees que l'on vient de modifier par
     * ailleurs : il tenterait de « detacher » les besoins deja supprimes en
     * annulant leur `project_id`, ce que la base refuse a juste titre.
     */
    await this.projects.update(
      { id: project.id },
      {
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.tagline !== undefined ? { tagline: input.tagline } : {}),
        ...(input.description !== undefined
          ? { description: input.description }
          : {}),
        visibility,
        participation,
        lastActivityAt: new Date(),
      },
    );

    if (input.tags) {
      const tags = await this.tags.resolveOrFail(input.tags);
      await this.projects.save(this.projects.create({ id: project.id, tags }));
    }

    if (input.needs) {
      await this.replaceNeeds(project, input.needs);
    }

    const full = await this.access.findByIdOrFail(project.id);

    await this.ai.projectIdentityChanged({
      projectId: full.id,
      title: full.title,
      description: full.description,
      tags: full.tags.map((tag) => tag.id),
      visibility: full.visibility,
    });

    return toProject(full);
  }

  /** R-PR3..R-PR6 : transitions explicites plutot qu'un `state` librement ecrit. */
  async transition(
    slug: string,
    user: UserEntity,
    transition: ProjectTransition,
  ): Promise<Project> {
    const project = await this.access.findBySlugOrFail(slug);
    const role = await this.access.roleOf(project.id, user.id);
    const rule = TRANSITIONS[transition];

    const allowed = rule.ownerOnly
      ? role === 'owner'
      : role === 'owner' || role === 'co_owner';
    if (!allowed) {
      throw ApiError.forbidden('Cette decision revient au porteur du projet.');
    }

    if (!rule.from.includes(project.state)) {
      throw ApiError.conflict(
        `Un projet « ${project.state} » ne peut pas subir cette transition.`,
      );
    }

    // R-PR3 : publier exige au moins un theme. Titre et accroche sont deja
    // garantis par les bornes du contrat, un theme peut avoir ete retire.
    if (transition === 'publish' && project.tags.length === 0) {
      throw ApiError.validation(
        'Choisis au moins un theme avant de publier ton projet.',
      );
    }

    // Meme precaution que pour la modification : on n'ecrit que les colonnes
    // concernees, sans resoumettre les relations chargees.
    await this.projects.update(
      { id: project.id },
      { state: rule.to, lastActivityAt: new Date() },
    );

    const full = await this.access.findByIdOrFail(project.id);
    if (transition === 'publish') {
      await this.ai.projectIdentityChanged({
        projectId: full.id,
        title: full.title,
        description: full.description,
        tags: full.tags.map((tag) => tag.id),
        visibility: full.visibility,
      });
    }

    return toProject(full);
  }

  /** R-PR7 : confirmation nominative, sensible a la casse. R-X3 : differee. */
  async remove(
    slug: string,
    user: UserEntity,
    confirmTitle: string,
  ): Promise<void> {
    const project = await this.access.findBySlugOrFail(slug);
    const isAdmin = user.platformRole === 'admin';
    if (project.ownerId !== user.id && !isAdmin) {
      throw ApiError.forbidden('Seul le porteur du projet peut le supprimer.');
    }
    if (confirmTitle !== project.title) {
      throw ApiError.validation(
        'Le titre saisi ne correspond pas a celui du projet.',
      );
    }

    await this.projects.update({ id: project.id }, { deletedAt: new Date() });
    await this.events.emitAsync(PROJECT_DELETED, { projectId: project.id });
  }

  /**
   * R-M2 : l'ancien porteur devient co-porteur.
   *
   * Le transfert est immediat, sans acceptation prealable du destinataire —
   * c'est l'ecart connu n°9 de SPEC.md, conserve tel quel pour ne pas
   * inventer une etape que le front n'affiche pas.
   */
  async transfer(
    slug: string,
    user: UserEntity,
    newOwnerId: string,
  ): Promise<Project> {
    const project = await this.access.findBySlugOrFail(slug);
    if (project.ownerId !== user.id) {
      throw ApiError.forbidden('Seul le porteur peut transferer son projet.');
    }
    if (newOwnerId === user.id) {
      throw ApiError.validation('Ce projet est deja le tien.');
    }

    await this.dataSource.transaction(async (manager) => {
      // R-M1 : l'index unique partiel interdit deux porteurs. L'ancien passe
      // co-porteur d'abord, sinon l'insertion du nouveau serait refusee.
      await manager.update(
        MembershipEntity,
        { projectId: project.id, userId: user.id },
        { role: 'co_owner' },
      );

      const existing = await manager.findOne(MembershipEntity, {
        where: { projectId: project.id, userId: newOwnerId },
      });
      if (existing) {
        await manager.update(
          MembershipEntity,
          { projectId: project.id, userId: newOwnerId },
          { role: 'owner', blocked: false },
        );
      } else {
        await manager.save(
          manager.create(MembershipEntity, {
            projectId: project.id,
            userId: newOwnerId,
            role: 'owner',
          }),
        );
      }

      await manager.update(
        ProjectEntity,
        { id: project.id },
        { ownerId: newOwnerId },
      );
    });

    // Le nouveau porteur n'etait peut-etre pas dans l'equipe.
    await this.events.emitAsync(PROJECT_TEAM_CHANGED, {
      projectId: project.id,
    });
    return toProject(await this.access.findByIdOrFail(project.id));
  }

  /**
   * Les besoins sont remplaces en bloc : le contrat envoie la liste complete,
   * et une reconciliation champ a champ n'apporterait rien qu'un risque
   * d'incoherence.
   */
  private async replaceNeeds(
    project: ProjectEntity,
    needs: ProjectUpdateInput['needs'],
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const previous = await manager.find(NeedEntity, {
        where: { projectId: project.id },
      });
      const previousById = new Map(previous.map((need) => [need.id, need]));

      await manager.delete(NeedEntity, { projectId: project.id });
      await manager.save(
        (needs ?? []).map((need) => {
          const before = previousById.get(need.id);
          return manager.create(NeedEntity, {
            id: need.id,
            projectId: project.id,
            label: need.label,
            tagId: need.tagId ?? null,
            fulfilled: need.fulfilled,
            // On horodate le passage a « pourvu » pour que le besoin reste
            // affiche barre 7 jours, puis disparaisse seul.
            fulfilledAt: need.fulfilled
              ? before?.fulfilled
                ? before.fulfilledAt
                : new Date()
              : null,
          });
        }),
      );
    });
  }

  private async uniqueSlug(base: string): Promise<string> {
    const taken = await this.projects.find({
      where: { slug: ILike(`${base}%`) },
      select: { slug: true },
    });
    const used = new Set(taken.map((project) => project.slug));

    if (!used.has(base)) return base;
    let suffix = 1;
    while (used.has(`${base}-${suffix}`)) suffix += 1;
    return `${base}-${suffix}`;
  }

  /** Verifie qu'un projet renvoye respecte bien le contrat (dev uniquement). */
  static assertContract(project: Project): Project {
    return projectSchema.parse(project);
  }
}
