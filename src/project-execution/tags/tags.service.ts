import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { Tag } from './entities/tag.entity.js';
import { Project } from '../projects/entities/project.entity.js';
import { CreateTagDto } from './dto/create-tag.dto.js';

@Injectable()
export class TagsService {
  constructor(
    @InjectRepository(Tag)
    private readonly tagRepo: Repository<Tag>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(tenantId: string, dto: CreateTagDto): Promise<Tag> {
    const existing = await this.tagRepo.findOne({
      where: { name: dto.name, tenantId },
    });
    if (existing) throw new ConflictException('Tag already exists');

    const tag = this.tagRepo.create({ ...dto, tenantId });
    const saved = await this.tagRepo.save(tag);

    this.eventEmitter.emit('tag.created', {
      tagId: saved.id,
      tenantId,
      name: saved.name,
    });

    return saved;
  }

  findAll(tenantId: string): Promise<Tag[]> {
    return this.tagRepo.find({ where: { tenantId } });
  }

  async findProjectTags(tenantId: string, projectId: string): Promise<Tag[]> {
    const project = await this.loadProjectWithTags(tenantId, projectId);
    return project.tags;
  }

  async addTagToProject(
    tenantId: string,
    projectId: string,
    tagId: string,
  ): Promise<Tag[]> {
    const tag = await this.tagRepo.findOne({ where: { id: tagId, tenantId } });
    if (!tag) throw new NotFoundException('Tag not found');

    const project = await this.loadProjectWithTags(tenantId, projectId);
    if (project.tags.some((t) => t.id === tagId)) {
      throw new ConflictException('Tag already attached to project');
    }

    project.tags.push(tag);
    const saved = await this.projectRepo.save(project);

    this.eventEmitter.emit('project.tag.added', { tenantId, projectId, tagId });

    return saved.tags;
  }

  async removeTagFromProject(
    tenantId: string,
    projectId: string,
    tagId: string,
  ): Promise<void> {
    const project = await this.loadProjectWithTags(tenantId, projectId);
    if (!project.tags.some((t) => t.id === tagId)) {
      throw new NotFoundException('Tag not attached to project');
    }

    project.tags = project.tags.filter((t) => t.id !== tagId);
    await this.projectRepo.save(project);

    this.eventEmitter.emit('project.tag.removed', {
      tenantId,
      projectId,
      tagId,
    });
  }

  private async loadProjectWithTags(
    tenantId: string,
    projectId: string,
  ): Promise<Project> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, tenantId },
      relations: ['tags'],
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }
}
