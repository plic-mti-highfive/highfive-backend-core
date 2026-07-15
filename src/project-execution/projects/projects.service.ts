import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Project } from './entities/project.entity.js';
import { Tag } from '../tags/entities/tag.entity.js';
import { ProjectMember } from '../project-members/entities/project-member.entity.js';
import { ProjectHighfive } from '../project-highfives/entities/project-highfive.entity.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { QueryProjectDto } from './dto/query-project.dto.js';
import { ProjectResponseDto } from './dto/project-response.dto.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { ProjectRole } from '@plic-mti-highfive/shared-types';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    @InjectRepository(ProjectHighfive)
    private readonly highfiveRepo: Repository<ProjectHighfive>,
    private readonly membersService: ProjectMembersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    const { tags, ...rest } = dto;
    const project = this.projectRepo.create({ ...rest, tenantId });
    project.tags = await this.resolveTags(tenantId, tags);
    const saved = await this.projectRepo.save(project);

    await this.membersService.addOwner(tenantId, saved.id, userId);

    const ownersMap = await this.membersService.getOwnersForProjects(tenantId, [
      saved.id,
    ]);

    this.eventEmitter.emit('project.created', {
      projectId: saved.id,
      tenantId,
      creatorId: userId,
      name: saved.name,
    });

    return ProjectResponseDto.fromEntity(saved, ownersMap.get(saved.id));
  }

  async findAll(
    tenantId: string,
    query: QueryProjectDto,
  ): Promise<{
    data: ProjectResponseDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.projectRepo
      .createQueryBuilder('project')
      .leftJoinAndSelect('project.tags', 'tag')
      .where('project.tenant_id = :tenantId', { tenantId });

    if (query.userId) {
      qb.innerJoin(
        'project_members',
        'pm',
        'pm.project_id = project.id AND pm.user_id = :userId AND pm.tenant_id = :tenantId',
        { userId: query.userId, tenantId },
      );
    }
    if (query.status) {
      qb.andWhere('project.status = :status', { status: query.status });
    }
    if (query.visibility) {
      qb.andWhere('project.visibility = :visibility', {
        visibility: query.visibility,
      });
    }
    if (query.search) {
      qb.andWhere(
        '(project.name ILIKE :search OR project.description ILIKE :search)',
        { search: `%${query.search}%` },
      );
    }
    if (query.tags && query.tags.length > 0) {
      qb.andWhere(
        'project.id IN (SELECT pt.project_id FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name IN (:...tagNames) AND t.tenant_id = :tenantId)',
        { tagNames: query.tags, tenantId },
      );
    }

    const order = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    switch (query.sortBy) {
      case 'name':
        qb.orderBy('project.name', order);
        break;
      case 'popularity':
        // TODO: sort by popularity (highfive or members count)
        qb.orderBy('project.createdAt', order);
        break;
      case 'date':
      default:
        qb.orderBy('project.createdAt', order);
        break;
    }

    qb.skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();

    const projectIds = data.map((p) => p.id);
    const [ownersMap, highfiveCounts, memberCounts] = await Promise.all([
      this.membersService.getOwnersForProjects(tenantId, projectIds),
      this.getHighfiveCounts(tenantId, projectIds),
      this.getMemberCounts(tenantId, projectIds),
    ]);

    return {
      data: data.map((p) =>
        ProjectResponseDto.fromEntity(
          p,
          ownersMap.get(p.id),
          highfiveCounts.get(p.id) ?? 0,
          memberCounts.get(p.id) ?? 0,
        ),
      ),
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(tenantId: string, id: string): Promise<ProjectResponseDto> {
    const project = await this.loadProject(tenantId, id);

    const [ownersMap, highfiveCounts, memberCounts] = await Promise.all([
      this.membersService.getOwnersForProjects(tenantId, [id]),
      this.getHighfiveCounts(tenantId, [id]),
      this.getMemberCounts(tenantId, [id]),
    ]);

    return ProjectResponseDto.fromEntity(
      project,
      ownersMap.get(id),
      highfiveCounts.get(id) ?? 0,
      memberCounts.get(id) ?? 0,
    );
  }

  async findByIds(
    tenantId: string,
    ids: string[],
  ): Promise<ProjectResponseDto[]> {
    return this.findManyByIds(tenantId, ids);
  }

  async findManyByIds(
    tenantId: string,
    ids: string[],
  ): Promise<ProjectResponseDto[]> {
    if (!ids.length) return [];
    const projects = await this.projectRepo.find({
      where: { id: In(ids), tenantId },
      relations: ['tags'],
      order: { createdAt: 'DESC' },
    });

    const [ownersMap, highfiveCounts, memberCounts] = await Promise.all([
      this.membersService.getOwnersForProjects(tenantId, ids),
      this.getHighfiveCounts(tenantId, ids),
      this.getMemberCounts(tenantId, ids),
    ]);

    return projects.map((p) =>
      ProjectResponseDto.fromEntity(
        p,
        ownersMap.get(p.id),
        highfiveCounts.get(p.id) ?? 0,
        memberCounts.get(p.id) ?? 0,
      ),
    );
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    await this.membersService.assertRole(tenantId, id, userId, [
      ProjectRole.OWNER,
      ProjectRole.ADMIN,
    ]);

    const project = await this.loadProject(tenantId, id);
    const oldVisibility = project.visibility;

    const { tags, ...rest } = dto;
    Object.assign(project, rest);
    if (tags !== undefined) {
      project.tags = await this.resolveTags(tenantId, tags);
    }
    const saved = await this.projectRepo.save(project);

    this.eventEmitter.emit('project.updated', {
      projectId: id,
      tenantId,
      actorId: userId,
      changes: dto,
    });

    if (dto.visibility && dto.visibility !== oldVisibility) {
      this.eventEmitter.emit('project.visibility.changed', {
        projectId: id,
        tenantId,
        oldVisibility,
        newVisibility: dto.visibility,
      });
    }

    const [ownersMap, highfiveCounts, memberCounts] = await Promise.all([
      this.membersService.getOwnersForProjects(tenantId, [id]),
      this.getHighfiveCounts(tenantId, [id]),
      this.getMemberCounts(tenantId, [id]),
    ]);

    return ProjectResponseDto.fromEntity(
      saved,
      ownersMap.get(id),
      highfiveCounts.get(id) ?? 0,
      memberCounts.get(id) ?? 0,
    );
  }

  async softDelete(
    tenantId: string,
    id: string,
    userId: string,
  ): Promise<void> {
    await this.membersService.assertRole(tenantId, id, userId, [
      ProjectRole.OWNER,
    ]);
    const result = await this.projectRepo.softDelete({ id, tenantId });
    if (result.affected === 0) {
      throw new NotFoundException('Project not found');
    }

    this.eventEmitter.emit('project.deleted', {
      projectId: id,
      tenantId,
      actorId: userId,
    });
  }

  /**
   * Record a user liking a project and emit event for AI processing
   */
  async likeProject(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    // Verify project exists
    await this.findById(tenantId, projectId);

    // TODO: Persist like relationship in database (create Likes table if needed)
    // For now, just emit the event to trigger AI job queueing

    this.eventEmitter.emit('project.liked', {
      projectId,
      tenantId,
      userId,
    });
  }

  /**
   * Record a user applying to a project and emit event for AI processing
   */
  async submitApplication(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    // Verify project exists
    await this.findById(tenantId, projectId);

    // TODO: Create Application entity and persist application record
    // For now, just emit the event to trigger AI job queueing

    this.eventEmitter.emit('project.application.submitted', {
      projectId,
      tenantId,
      userId,
    });
  }

  private async loadProject(tenantId: string, id: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id, tenantId },
      relations: ['tags'],
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  private async resolveTags(
    tenantId: string,
    tagNames: string[] | undefined,
  ): Promise<Tag[]> {
    if (!tagNames?.length) return [];

    const uniqueNames = [...new Set(tagNames.map((n) => n.trim()))].filter(
      Boolean,
    );
    const existing = await this.tagRepo.find({
      where: { name: In(uniqueNames), tenantId },
    });
    const existingNames = new Set(existing.map((t) => t.name));
    const missingNames = uniqueNames.filter((n) => !existingNames.has(n));

    if (missingNames.length === 0) return existing;

    const created = await this.tagRepo.save(
      missingNames.map((name) => this.tagRepo.create({ name, tenantId })),
    );
    return [...existing, ...created];
  }

  /** Taille des equipes, en une requete groupee plutot qu'une par projet. */
  private async getMemberCounts(
    tenantId: string,
    projectIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (projectIds.length === 0) return counts;

    const rows = await this.memberRepo
      .createQueryBuilder('member')
      .select('member.projectId', 'projectId')
      .addSelect('COUNT(*)', 'count')
      .where('member.tenantId = :tenantId', { tenantId })
      .andWhere('member.projectId IN (:...projectIds)', { projectIds })
      .groupBy('member.projectId')
      .getRawMany<{ projectId: string; count: string }>();

    for (const row of rows) {
      counts.set(row.projectId, Number(row.count));
    }
    return counts;
  }

  private async getHighfiveCounts(
    tenantId: string,
    projectIds: string[],
  ): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (projectIds.length === 0) return counts;

    const rows = await this.highfiveRepo
      .createQueryBuilder('highfive')
      .select('highfive.projectId', 'projectId')
      .addSelect('COUNT(*)', 'count')
      .where('highfive.tenantId = :tenantId', { tenantId })
      .andWhere('highfive.projectId IN (:...projectIds)', { projectIds })
      .groupBy('highfive.projectId')
      .getRawMany<{ projectId: string; count: string }>();

    for (const row of rows) {
      counts.set(row.projectId, Number(row.count));
    }
    return counts;
  }
}
