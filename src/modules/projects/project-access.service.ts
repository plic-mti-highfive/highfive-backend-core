import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { MembershipRole, ProjectSummary } from '../../contracts/index.js';
import {
  MembershipEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  toUserSummary,
  visibleNeeds,
  toNeed,
} from '../../common/mappers/index.js';

/** Du plus etendu au plus restreint (doc 05 §3). */
const ROLE_RANK: Record<MembershipRole, number> = {
  owner: 4,
  co_owner: 3,
  member: 2,
  observer: 1,
};

export const atLeast = (
  role: MembershipRole | undefined,
  minimum: MembershipRole,
): boolean => !!role && ROLE_RANK[role] >= ROLE_RANK[minimum];

/**
 * Lecture des projets et des droits qui vont avec.
 *
 * Centralise ici parce que presque tous les domaines (annonces, taches,
 * fichiers, Mur...) posent les trois memes questions : ce projet existe-t-il,
 * ce lecteur a-t-il le droit de le voir, et quel role y tient-il ?
 */
@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /** R-X3 : un projet supprime n'existe plus pour aucune lecture. */
  async findBySlugOrFail(slug: string): Promise<ProjectEntity> {
    const project = await this.projects.findOne({
      where: { slug, deletedAt: IsNull() },
    });
    if (!project) throw ApiError.notFound("Ce projet n'existe pas.");
    return project;
  }

  async findByIdOrFail(id: string): Promise<ProjectEntity> {
    const project = await this.projects.findOne({
      where: { id, deletedAt: IsNull() },
    });
    if (!project) throw ApiError.notFound("Ce projet n'existe pas.");
    return project;
  }

  async roleOf(
    projectId: string,
    userId: string | undefined,
  ): Promise<MembershipRole | undefined> {
    if (!userId) return undefined;
    const membership = await this.memberships.findOne({
      where: { projectId, userId },
    });
    // Une personne bloquee n'a plus aucun role sur le projet (R-M4).
    return membership && !membership.blocked ? membership.role : undefined;
  }

  /**
   * R-PR2 (un brouillon n'appartient qu'a son porteur) et R-V3 (un projet
   * prive n'est lisible que par son equipe).
   */
  async assertCanView(
    project: ProjectEntity,
    user: UserEntity | undefined,
  ): Promise<MembershipRole | undefined> {
    const role = await this.roleOf(project.id, user?.id);
    if (user?.platformRole === 'admin') return role;

    if (project.state === 'draft' && role !== 'owner') {
      throw ApiError.notFound("Ce projet n'existe pas.");
    }
    if (project.visibility === 'private' && !role) {
      throw ApiError.forbidden('Ce projet est prive.');
    }
    return role;
  }

  /** Exige un role minimal, sans jamais reveler l'existence d'un projet cache. */
  async assertRole(
    project: ProjectEntity,
    user: UserEntity | undefined,
    minimum: MembershipRole,
  ): Promise<MembershipRole> {
    const role = await this.roleOf(project.id, user?.id);
    if (!atLeast(role, minimum)) {
      throw ApiError.forbidden("Tu n'as pas le droit de faire ca ici.");
    }
    return role!;
  }

  /**
   * SPEC.md §2.1 : toute ecriture dans Le Lab ou sur la fiche remonte
   * l'activite du projet. C'est ce qui alimente le tri « les plus actifs » et
   * l'archivage automatique a 180 jours.
   */
  async touch(projectId: string): Promise<void> {
    await this.projects.update(
      { id: projectId },
      { lastActivityAt: new Date() },
    );
  }

  /**
   * R-V1 : ce qui peut apparaitre dans un fil ou une recherche publique —
   * public *et* actif. Un projet termine reste consultable par son lien et sur
   * le profil de son porteur (R-V4), mais ne se propose plus a la decouverte.
   */
  discoverableWhere() {
    return {
      deletedAt: IsNull(),
      visibility: 'public' as const,
      state: 'active' as const,
    };
  }

  /**
   * Cartes du fil et de la recherche. `membersCount` et `teamPreview` sont
   * calcules ici en une requete pour tout le lot : une carte ne doit jamais
   * couter une requete de plus (doc 11 C1, decider en 10 secondes).
   */
  async summarize(projects: ProjectEntity[]): Promise<ProjectSummary[]> {
    if (projects.length === 0) return [];

    const ids = projects.map((project) => project.id);
    const memberships = await this.memberships.find({
      where: { projectId: In(ids), blocked: false },
    });

    // Le porteur est toujours membre (R-M1), mais on l'ajoute explicitement :
    // une carte sans son porteur serait invalide au regard du contrat.
    const userIds = [
      ...new Set([
        ...memberships.map((m) => m.userId),
        ...projects.map((project) => project.ownerId),
      ]),
    ];
    const users = await this.users.find({ where: { id: In(userIds) } });
    const byUserId = new Map(users.map((user) => [user.id, user]));

    const byProject = new Map<string, MembershipEntity[]>();
    for (const membership of memberships) {
      const list = byProject.get(membership.projectId) ?? [];
      list.push(membership);
      byProject.set(membership.projectId, list);
    }

    return projects.map((project) => {
      const team = byProject.get(project.id) ?? [];
      // Le porteur d'abord, puis les autres par anciennete : un visage connu
      // en tete plutot qu'un ordre de base de donnees.
      const ordered = [...team].sort((a, b) => {
        if (a.role === 'owner') return -1;
        if (b.role === 'owner') return 1;
        return a.joinedAt.getTime() - b.joinedAt.getTime();
      });

      return {
        id: project.id,
        slug: project.slug,
        title: project.title,
        tagline: project.tagline,
        tags: (project.tags ?? []).map((tag) => tag.id),
        needs: visibleNeeds(project.needs).map(toNeed),
        visibility: project.visibility,
        participation: project.participation,
        state: project.state,
        highfiveCount: project.highfiveCount,
        membersCount: team.length,
        teamPreview: ordered
          .slice(0, 6)
          .map((membership) => byUserId.get(membership.userId))
          .filter((user): user is UserEntity => !!user)
          .map(toUserSummary),
        owner: toUserSummary(
          byUserId.get(project.ownerId) ?? ({} as UserEntity),
        ),
      };
    });
  }

  /** Projets ou la personne tient un role (porteur inclus). */
  async projectIdsOf(userId: string): Promise<string[]> {
    const memberships = await this.memberships.find({
      where: { userId, blocked: false },
    });
    return memberships.map((membership) => membership.projectId);
  }
}
