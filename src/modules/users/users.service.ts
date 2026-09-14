import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';
import type {
  CurrentUser,
  ProjectSummary,
  User,
  UserProfileUpdateInput,
  UserSummary,
} from '../../contracts/index.js';
import {
  MembershipEntity,
  ProjectEntity,
  UserEntity,
} from '../../entities/index.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  toCurrentUser,
  toUser,
  toUserSummary,
} from '../../common/mappers/index.js';
import { AiEventsService } from '../../common/ai/ai-events.service.js';
import { AiRecommendationsService } from '../../common/ai/ai-recommendations.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { TagsService } from '../tags/tags.service.js';

export interface UserProjectsResponse {
  created: ProjectSummary[];
  collaborations: ProjectSummary[];
  /** R-V4 : les projets prives se comptent, ne se nomment jamais. */
  privateProjectsCount: number;
}

/** Taille de la colonne d'appui « Des gens a rencontrer ». */
const PEOPLE_FEED_SIZE = 8;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly access: ProjectAccessService,
    private readonly tags: TagsService,
    private readonly ai: AiEventsService,
    private readonly recommendations: AiRecommendationsService,
  ) {}

  async getPublicProfile(username: string): Promise<User> {
    const user = await this.findAliveOrFail(username);
    return toUser(user);
  }

  /**
   * R-P1 : un compte suspendu a bio et avatar verrouilles. La regle porte sur
   * la route entiere, pas sur les seuls champs concernes — un corps qui ne
   * toucherait que les interets est refuse lui aussi.
   */
  async updateProfile(
    user: UserEntity,
    input: UserProfileUpdateInput,
  ): Promise<CurrentUser> {
    if (user.accountStatus !== 'active') {
      throw ApiError.forbidden(
        'Ton compte est suspendu : ton profil est verrouille.',
      );
    }

    if (input.displayName !== undefined) user.displayName = input.displayName;
    if (input.bio !== undefined) user.bio = input.bio;
    if (input.interests !== undefined) {
      user.interests = await this.tags.resolveOrFail(input.interests);
    }

    const saved = await this.users.save(user);

    await this.ai.userIdentityChanged({
      userId: saved.id,
      bio: saved.bio,
      interests: saved.interests.map((tag) => tag.id),
    });

    return toCurrentUser(saved);
  }

  /** R-V4 : projets publics actifs ou termines, plus le compte des prives. */
  async listUserProjects(username: string): Promise<UserProjectsResponse> {
    const user = await this.findAliveOrFail(username);

    const memberships = await this.memberships.find({
      where: { userId: user.id, blocked: false },
    });
    if (memberships.length === 0) {
      return { created: [], collaborations: [], privateProjectsCount: 0 };
    }

    const projects = await this.projects.find({
      where: {
        id: In(memberships.map((m) => m.projectId)),
        deletedAt: IsNull(),
      },
      order: { lastActivityAt: 'DESC' },
    });

    const roleByProject = new Map(
      memberships.map((membership) => [membership.projectId, membership.role]),
    );
    const isShowable = (project: ProjectEntity): boolean =>
      project.visibility === 'public' &&
      (project.state === 'active' || project.state === 'done');

    const owned = projects.filter((p) => p.ownerId === user.id);
    const collaborated = projects.filter(
      (p) => p.ownerId !== user.id && roleByProject.get(p.id) !== 'owner',
    );

    return {
      created: await this.access.summarize(owned.filter(isShowable)),
      collaborations: await this.access.summarize(
        collaborated.filter(isShowable),
      ),
      privateProjectsCount: projects.filter(
        (project) => project.visibility === 'private',
      ).length,
    };
  }

  /**
   * Colonne d'appui « Des gens a rencontrer ».
   *
   * Le service IA sait proposer des personnes pertinentes pour un projet : on
   * lui demande pour le projet le plus recent du lecteur. Sans reponse (IA
   * absente, visiteur anonyme, personne sans projet), on retombe sur les
   * comptes actifs les plus recemment vus — un fil imparfait vaut mieux qu'une
   * colonne vide.
   */
  async listSuggestedPeople(
    viewerId: string | undefined,
  ): Promise<UserSummary[]> {
    const recommended = await this.recommendedPeople(viewerId);
    if (recommended.length >= PEOPLE_FEED_SIZE) return recommended;

    const already = new Set(recommended.map((person) => person.id));
    const fallback = await this.users.find({
      where: { accountStatus: 'active', deletedAt: IsNull() },
      order: { lastVisitAt: 'DESC' },
      take: PEOPLE_FEED_SIZE * 2,
    });

    for (const user of fallback) {
      if (recommended.length >= PEOPLE_FEED_SIZE) break;
      if (already.has(user.id) || user.id === viewerId) continue;
      recommended.push(toUserSummary(user));
      already.add(user.id);
    }

    return recommended;
  }

  private async recommendedPeople(
    viewerId: string | undefined,
  ): Promise<UserSummary[]> {
    if (!viewerId) return [];

    const membership = await this.memberships.findOne({
      where: { userId: viewerId, blocked: false },
      order: { joinedAt: 'DESC' },
    });
    if (!membership) return [];

    const ids = await this.recommendations.usersForProject(
      membership.projectId,
      PEOPLE_FEED_SIZE,
    );
    if (ids.length === 0) return [];

    const users = await this.users.find({
      where: {
        id: In(ids.filter((id) => id !== viewerId)),
        accountStatus: 'active',
        deletedAt: IsNull(),
      },
    });

    // L'ordre de l'IA est l'information utile : la base le perdrait.
    const rank = new Map(ids.map((id, index) => [id, index]));
    return users
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0))
      .map(toUserSummary);
  }

  async setAvatar(user: UserEntity, url: string): Promise<string> {
    user.avatarUrl = url;
    await this.users.save(user);
    return url;
  }

  private async findAliveOrFail(username: string): Promise<UserEntity> {
    const user = await this.users.findOne({
      where: { username, deletedAt: IsNull(), accountStatus: Not('deleted') },
    });
    if (!user) throw ApiError.notFound('Cette personne est introuvable.');
    return user;
  }
}
