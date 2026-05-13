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
    const { tagIds, ...rest } = dto;
    const project = this.projectRepo.create({ ...rest, tenantId });
    project.tags = await this.resolveTags(tenantId, tagIds);
    const saved = await this.projectRepo.save(project);

    await this.membersService.addOwner(tenantId, saved.id, userId);

    this.eventEmitter.emit('project.created', {
      projectId: saved.id,
      tenantId,
      creatorId: userId,
      name: saved.name,
    });

    return this.toResponse(saved);
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
    if (query.tag) {
      qb.andWhere(
        'project.id IN (SELECT pt.project_id FROM project_tags pt JOIN tags t ON t.id = pt.tag_id WHERE t.name = :tagName AND t.tenant_id = :tenantId)',
        { tagName: query.tag, tenantId },
      );
    }

    qb.orderBy('project.created_at', 'DESC').skip(offset).take(limit);

    const [data, total] = await qb.getManyAndCount();
    const enriched = await Promise.all(data.map((p) => this.toResponse(p)));

    return {
      data: enriched,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(tenantId: string, id: string): Promise<ProjectResponseDto> {
    const project = await this.loadProject(tenantId, id);
    return this.toResponse(project);
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

    const { tagIds, ...rest } = dto;
    Object.assign(project, rest);
    if (tagIds !== undefined) {
      project.tags = await this.resolveTags(tenantId, tagIds);
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

    return this.toResponse(saved);
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

  async findByOwner(
    tenantId: string,
    userId: string,
  ): Promise<ProjectResponseDto[]> {
    return this.findByMemberRole(tenantId, userId, ProjectRole.OWNER);
  }

  async findByContributor(
    tenantId: string,
    userId: string,
  ): Promise<ProjectResponseDto[]> {
    const memberships = await this.memberRepo.find({
      where: { userId, tenantId },
    });
    const ids = memberships
      .filter((m) => m.role !== ProjectRole.OWNER)
      .map((m) => m.projectId);
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
    });
    return Promise.all(projects.map((p) => this.toResponse(p)));
  }

  private async findByMemberRole(
    tenantId: string,
    userId: string,
    role: ProjectRole,
  ): Promise<ProjectResponseDto[]> {
    const memberships = await this.memberRepo.find({
      where: { userId, tenantId, role },
    });
    const ids = memberships.map((m) => m.projectId);
    return this.findManyByIds(tenantId, ids);
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
    tagIds: string[] | undefined,
  ): Promise<Tag[]> {
    if (!tagIds?.length) return [];
    return this.tagRepo.find({ where: { id: In(tagIds), tenantId } });
  }

  private async toResponse(project: Project): Promise<ProjectResponseDto> {
    const [owner, contributorsCount, highfiveCount] = await Promise.all([
      this.memberRepo.findOne({
        where: {
          projectId: project.id,
          tenantId: project.tenantId,
          role: ProjectRole.OWNER,
        },
      }),
      this.memberRepo.count({
        where: { projectId: project.id, tenantId: project.tenantId },
      }),
      this.highfiveRepo.count({
        where: { projectId: project.id, tenantId: project.tenantId },
      }),
    ]);

    return {
      id: project.id,
      tenantId: project.tenantId,
      name: project.name,
      description: project.description,
      status: project.status,
      visibility: project.visibility,
      tags: (project.tags ?? []).map((t) => t.name),
      ownerId: owner?.userId ?? null,
      contributorsCount,
      highfiveCount,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
      deletedAt: project.deletedAt,
    };
  }
}
