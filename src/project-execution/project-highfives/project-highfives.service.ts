import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { ProjectHighfive } from './entities/project-highfive.entity.js';
import { Project } from '../projects/entities/project.entity.js';

@Injectable()
export class ProjectHighfivesService {
  constructor(
    @InjectRepository(ProjectHighfive)
    private readonly highfiveRepo: Repository<ProjectHighfive>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async add(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectHighfive> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');

    const existing = await this.highfiveRepo.findOne({
      where: { projectId, userId, tenantId },
    });
    if (existing) throw new ConflictException('Already high-fived');

    const highfive = this.highfiveRepo.create({ projectId, userId, tenantId });
    const saved = await this.highfiveRepo.save(highfive);

    this.eventEmitter.emit('project.highfive.added', {
      projectId,
      tenantId,
      userId,
    });

    return saved;
  }

  async remove(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<void> {
    const result = await this.highfiveRepo.delete({
      projectId,
      userId,
      tenantId,
    });
    if (result.affected === 0) {
      throw new NotFoundException('High-five not found');
    }

    this.eventEmitter.emit('project.highfive.removed', {
      projectId,
      tenantId,
      userId,
    });
  }

  countByProject(tenantId: string, projectId: string): Promise<number> {
    return this.highfiveRepo.count({ where: { projectId, tenantId } });
  }

  findLikedProjectIds(tenantId: string, userId: string): Promise<string[]> {
    return this.highfiveRepo
      .find({ where: { userId, tenantId }, select: ['projectId'] })
      .then((rows) => rows.map((r) => r.projectId));
  }
}
