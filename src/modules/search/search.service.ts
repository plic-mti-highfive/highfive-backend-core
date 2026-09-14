import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ILike, In, IsNull, Repository } from 'typeorm';
import type {
  DiscoverFeed,
  DiscoverSection,
  Paginated,
  ProjectSummary,
  SearchEntityType,
  SearchResults,
  SearchSort,
  TrendingTag,
} from '../../contracts/index.js';
import {
  MembershipEntity,
  ProjectEntity,
  TagEntity,
  UserEntity,
} from '../../entities/index.js';
import {
  clampLimit,
  decodeCursor,
  paginateArray,
  toPage,
} from '../../common/http/pagination.js';
import { toTag, toUserSummary } from '../../common/mappers/index.js';
import { AiRecommendationsService } from '../../common/ai/ai-recommendations.service.js';
import { ProjectAccessService } from '../projects/project-access.service.js';
import { TagsService } from '../tags/tags.service.js';

/** Chaque section de Decouvrir tient en six projets, sans pagination. */
const SECTION_LIMIT = 6;

/** Colonne « Ce qui bouge en ce moment » : cinq themes au plus. */
const TRENDING_LIMIT = 5;

export interface SearchQuery {
  q?: string;
  types?: SearchEntityType[];
  tags?: string[];
  sort?: SearchSort;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class SearchService {
  constructor(
    @InjectRepository(ProjectEntity)
    private readonly projects: Repository<ProjectEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(TagEntity)
    private readonly tags: Repository<TagEntity>,
    @InjectRepository(MembershipEntity)
    private readonly memberships: Repository<MembershipEntity>,
    private readonly access: ProjectAccessService,
    private readonly tagsService: TagsService,
    private readonly recommendations: AiRecommendationsService,
  ) {}

  /**
   * R-R4 / R-IA-4 : la recherche reste deterministe. Aucune personnalisation
   * cachee — ce qui est cherche est trouve, dans l'ordre demande.
   */
  async search(query: SearchQuery): Promise<SearchResults> {
    const types = query.types ?? ['projects', 'users', 'tags'];
    const results: SearchResults = {};

    if (types.includes('projects')) {
      results.projects = await this.searchProjects(query);
    }
    if (types.includes('users')) {
      results.users = await this.searchUsers(query);
    }
    if (types.includes('tags')) {
      results.tags = await this.searchTags(query);
    }

    return results;
  }

  /**
   * Fil Decouvrir : un projet du moment, puis des sections courtes.
   *
   * `for_you` et `near_your_projects` sont personnalisees : elles sont
   * absentes — et non vides — pour un visiteur ou un compte sans interet ni
   * projet. Une section vide serait une promesse non tenue.
   */
  async discover(viewer: UserEntity | undefined): Promise<DiscoverFeed> {
    const pool = await this.projects.find({
      where: this.access.discoverableWhere(),
      order: { lastActivityAt: 'DESC' },
      take: 200,
    });

    const moment = this.pickMoment(pool);
    const rest = pool.filter((project) => project.id !== moment?.id);

    const sections: DiscoverSection[] = [];

    const forYou = await this.forYouSection(viewer, rest);
    if (forYou) sections.push(forYou);

    sections.push({
      id: 'starting',
      items: await this.access.summarize(
        [...rest]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(0, SECTION_LIMIT),
      ),
      seeAll: { types: ['projects'], sort: 'recent' },
    });

    sections.push({
      id: 'trending_highfives',
      items: await this.access.summarize(
        [...rest]
          .sort((a, b) => b.highfiveCount - a.highfiveCount)
          .slice(0, SECTION_LIMIT),
      ),
      seeAll: { types: ['projects'], sort: 'popular' },
    });

    const seekingHelp = rest.filter((project) =>
      (project.needs ?? []).some((need) => !need.fulfilled),
    );
    if (seekingHelp.length > 0) {
      sections.push({
        id: 'needs_help',
        items: await this.access.summarize(seekingHelp.slice(0, SECTION_LIMIT)),
        seeAll: { types: ['projects'] },
      });
    }

    const nearby = await this.nearYourProjectsSection(viewer, rest);
    if (nearby) sections.push(nearby);

    return {
      moment: moment ? (await this.access.summarize([moment]))[0] : null,
      sections,
    };
  }

  async projectsByTag(
    tagId: string,
    cursor: string | undefined,
    limit: number | undefined,
  ): Promise<Paginated<ProjectSummary>> {
    const offset = decodeCursor(cursor);
    const size = clampLimit(limit);

    const [rows, total] = await this.projects
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.tags', 'tag')
      .leftJoinAndSelect('project.needs', 'need')
      .where('project.deletedAt IS NULL')
      .andWhere("project.visibility = 'public'")
      .andWhere("project.state = 'active'")
      .andWhere(
        'EXISTS (SELECT 1 FROM project_tags pt WHERE pt.project_id = project.id AND pt.tag_id = :tagId)',
        { tagId },
      )
      .orderBy('project.lastActivityAt', 'DESC')
      .skip(offset)
      .take(size)
      .getManyAndCount();

    return toPage(await this.access.summarize(rows), total, offset);
  }

  /** Comptage des themes portes par les projets publics actifs. */
  async trendingTags(): Promise<TrendingTag[]> {
    const rows = await this.projects
      .createQueryBuilder('project')
      .innerJoin('project_tags', 'pt', 'pt.project_id = project.id')
      .select('pt.tag_id', 'tagId')
      .addSelect('COUNT(*)', 'count')
      .where('project.deletedAt IS NULL')
      .andWhere("project.visibility = 'public'")
      .andWhere("project.state = 'active'")
      .groupBy('pt.tag_id')
      .orderBy('COUNT(*)', 'DESC')
      .limit(TRENDING_LIMIT)
      .getRawMany<{ tagId: string; count: string }>();

    if (rows.length === 0) return [];

    const tags = await this.tags.find({
      where: { id: In(rows.map((row) => row.tagId)), active: true },
    });
    const byId = new Map(tags.map((tag) => [tag.id, tag]));

    return rows
      .filter((row) => byId.has(row.tagId))
      .map((row) => ({
        tag: toTag(byId.get(row.tagId)!),
        projectsCount: Number(row.count),
      }));
  }

  private async searchProjects(
    query: SearchQuery,
  ): Promise<Paginated<ProjectSummary>> {
    const builder = this.projects
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.tags', 'tag')
      .leftJoinAndSelect('project.needs', 'need')
      .where('project.deletedAt IS NULL')
      .andWhere("project.visibility = 'public'")
      .andWhere("project.state = 'active'");

    if (query.q) {
      builder.andWhere(
        '(project.title ILIKE :q OR project.tagline ILIKE :q OR project.description ILIKE :q)',
        { q: `%${query.q}%` },
      );
    }
    if (query.tags?.length) {
      builder.andWhere(
        'EXISTS (SELECT 1 FROM project_tags pt WHERE pt.project_id = project.id AND pt.tag_id IN (:...tagIds))',
        { tagIds: query.tags },
      );
    }

    switch (query.sort) {
      case 'popular':
        builder.orderBy('project.highfiveCount', 'DESC');
        break;
      case 'active':
        builder.orderBy('project.lastActivityAt', 'DESC');
        break;
      default:
        // `relevant` merite un vrai classement plein texte (tsvector/ts_rank).
        // Tant qu'il n'existe pas, on trie par creation plutot que de feindre
        // une pertinence qu'on ne calcule pas.
        builder.orderBy('project.createdAt', 'DESC');
    }

    const offset = decodeCursor(query.cursor);
    const size = clampLimit(query.limit);
    const [rows, total] = await builder
      .skip(offset)
      .take(size)
      .getManyAndCount();

    return toPage(await this.access.summarize(rows), total, offset);
  }

  private async searchUsers(query: SearchQuery) {
    const where = query.q
      ? [
          {
            accountStatus: 'active' as const,
            deletedAt: IsNull(),
            username: ILike(`%${query.q}%`),
          },
          {
            accountStatus: 'active' as const,
            deletedAt: IsNull(),
            displayName: ILike(`%${query.q}%`),
          },
        ]
      : { accountStatus: 'active' as const, deletedAt: IsNull() };

    const offset = decodeCursor(query.cursor);
    const size = clampLimit(query.limit);

    const [rows, total] = await this.users.findAndCount({
      where,
      order: { username: 'ASC' },
      skip: offset,
      take: size,
    });

    return toPage(rows.map(toUserSummary), total, offset);
  }

  private async searchTags(query: SearchQuery) {
    const all = await this.tagsService.listActive();
    const filtered = query.q
      ? all.filter((tag) =>
          tag.label.toLowerCase().includes(query.q!.toLowerCase()),
        )
      : all;

    // La liste des themes est fermee et tient en memoire : la paginer en base
    // couterait une requete pour vingt-quatre lignes.
    return paginateArray(filtered, query.cursor, query.limit);
  }

  /**
   * Projet du moment : le plus soutenu parmi les projets decouvrables. Choix
   * stable d'un appel a l'autre, et qui ne depend d'aucun reglage manuel.
   */
  private pickMoment(pool: ProjectEntity[]): ProjectEntity | null {
    if (pool.length === 0) return null;
    return [...pool].sort(
      (a, b) =>
        b.highfiveCount - a.highfiveCount ||
        b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
    )[0];
  }

  /**
   * « Pour toi » : les themes suivis d'abord, dans l'ordre que propose le
   * service IA quand il repond. Sans lui, l'ordre est l'activite recente — la
   * section reste utile, simplement moins fine.
   */
  private async forYouSection(
    viewer: UserEntity | undefined,
    pool: ProjectEntity[],
  ): Promise<DiscoverSection | null> {
    const interests = (viewer?.interests ?? []).map((tag) => tag.id);
    if (!viewer || interests.length === 0) return null;

    const matching = pool.filter((project) =>
      (project.tags ?? []).some((tag) => interests.includes(tag.id)),
    );
    if (matching.length === 0) return null;

    const ranked = await this.rankByAi(viewer.id, matching);

    return {
      id: 'for_you',
      items: await this.access.summarize(ranked.slice(0, SECTION_LIMIT)),
      seeAll: { types: ['projects'], tags: interests, sort: 'active' },
    };
  }

  /** « Pres de tes projets » : memes themes que ce que la personne porte deja. */
  private async nearYourProjectsSection(
    viewer: UserEntity | undefined,
    pool: ProjectEntity[],
  ): Promise<DiscoverSection | null> {
    if (!viewer) return null;

    const memberships = await this.memberships.find({
      where: { userId: viewer.id, blocked: false },
    });
    if (memberships.length === 0) return null;

    const mine = new Set(memberships.map((row) => row.projectId));
    const myProjects = await this.projects.find({
      where: { id: In([...mine]) },
    });
    const myTags = new Set(
      myProjects.flatMap((project) =>
        (project.tags ?? []).map((tag) => tag.id),
      ),
    );
    if (myTags.size === 0) return null;

    const items = pool
      .filter(
        (project) =>
          !mine.has(project.id) &&
          (project.tags ?? []).some((tag) => myTags.has(tag.id)),
      )
      .sort((a, b) => b.highfiveCount - a.highfiveCount)
      .slice(0, SECTION_LIMIT);

    if (items.length === 0) return null;

    return {
      id: 'near_your_projects',
      items: await this.access.summarize(items),
      seeAll: { types: ['projects'], tags: [...myTags], sort: 'active' },
    };
  }

  private async rankByAi(
    userId: string,
    projects: ProjectEntity[],
  ): Promise<ProjectEntity[]> {
    const recommended = await this.recommendations.projectsForUser(
      userId,
      SECTION_LIMIT * 4,
    );
    if (recommended.length === 0) {
      return [...projects].sort(
        (a, b) => b.lastActivityAt.getTime() - a.lastActivityAt.getTime(),
      );
    }

    const rank = new Map(recommended.map((id, index) => [id, index]));
    // Les projets que l'IA ne connait pas encore ne disparaissent pas : ils
    // passent derriere ceux qu'elle classe.
    return [...projects].sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
  }
}
