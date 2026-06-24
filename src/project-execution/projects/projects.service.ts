import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Project } from './entities/project.entity.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { QueryProjectDto } from './dto/query-project.dto.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { ProjectRole } from '@plic-mti-highfive/shared-types';
import { ProjectResponseDto } from './dto/project-response.dto.js';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly membersService: ProjectMembersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  private toResponseDto(project: Project): ProjectResponseDto {
    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      visibility: project.visibility,
      tags: project.tags,
      highfiveCount: 0, // TODO: calculate actual highfive count
      createdAt: project.createdAt,
    };
  }

  async create(
    tenantId: string,
    userId: string,
    dto: CreateProjectDto,
  ): Promise<ProjectResponseDto> {
    const project = this.projectRepo.create({
      ...dto,
      tenantId,
    });
    const saved = await this.projectRepo.save(project);

    // Creator becomes OWNER
    await this.membersService.addOwner(tenantId, saved.id, userId);

    this.eventEmitter.emit('project.created', {
      projectId: saved.id,
      tenantId,
      creatorId: userId,
      name: saved.name,
    });

    return this.toResponseDto(saved);
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

    const db = this.projectRepo
      .createQueryBuilder('project')
      .where('project.tenantId = :tenantId', { tenantId });

    if (query.status) {
      db.andWhere('project.status = :status', { status: query.status });
    }

    if (query.visibility) {
      db.andWhere('project.visibility = :visibility', {
        visibility: query.visibility,
      });
    }

    if (query.search) {
      db.andWhere(
        'project.name ILIKE :search OR project.description ILIKE :search',
        {
          search: `%${query.search}%`,
        },
      );
    }

    if (query.tags && query.tags.length > 0) {
      db.andWhere('project.tags && ARRAY[:...tags]::varchar[]', {
        tags: query.tags,
      });
    }

    const order = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    switch (query.sortBy) {
      case 'name':
        db.orderBy('project.name', order);
        break;
      case 'popularity':
        // TODO: sort by popularity like highfive or members count
        break;
      case 'date':
      default:
        db.orderBy('project.createdAt', order);
        break;
    }

    const [data, total] = await db.skip(offset).take(limit).getManyAndCount();

    return {
      data: data.map((project) => this.toResponseDto(project)),
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(tenantId: string, id: string): Promise<ProjectResponseDto> {
    const project = await this.projectRepo.findOne({
      where: { id, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return this.toResponseDto(project);
  }

  async findByIds(
    tenantId: string,
    ids: string[],
  ): Promise<ProjectResponseDto[]> {
    if (ids.length === 0) return [];
    const projects = await this.projectRepo.find({
      where: {
        id: In(ids),
        tenantId,
      },
      order: { createdAt: 'DESC' },
    });
    return projects.map((project) => this.toResponseDto(project));
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

    const project = await this.findById(tenantId, id);
    const oldVisibility = project.visibility;

    Object.assign(project, dto);
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

    return this.toResponseDto(saved);
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
}
