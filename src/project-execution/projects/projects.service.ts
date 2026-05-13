import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Project } from './entities/project.entity.js';
import { CreateProjectDto } from './dto/create-project.dto.js';
import { UpdateProjectDto } from './dto/update-project.dto.js';
import { QueryProjectDto } from './dto/query-project.dto.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { ProjectRole } from '@plic-mti-highfive/shared-types';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly membersService: ProjectMembersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateProjectDto,
  ): Promise<Project> {
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

    return saved;
  }

  async findAll(
    tenantId: string,
    query: QueryProjectDto,
  ): Promise<{
    data: Project[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const where: FindOptionsWhere<Project> = { tenantId };
    if (query.status) where.status = query.status;
    if (query.visibility) where.visibility = query.visibility;

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const [data, total] = await this.projectRepo.findAndCount({
      where,
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      data,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(tenantId: string, id: string): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateProjectDto,
  ): Promise<Project> {
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

    return saved;
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
