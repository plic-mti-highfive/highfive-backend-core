import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { ProjectMessage } from './entities/project-message.entity.js';
import { CreateMessageDto } from './dto/create-message.dto.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';

@Injectable()
export class ProjectMessagesService {
  constructor(
    @InjectRepository(ProjectMessage)
    private readonly messageRepo: Repository<ProjectMessage>,
    private readonly membersService: ProjectMembersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    projectId: string,
    authorId: string,
    dto: CreateMessageDto,
  ): Promise<ProjectMessage> {
    await this.membersService.assertMember(tenantId, projectId, authorId);

    if (dto.replyToId) {
      const parent = await this.messageRepo.findOne({
        where: { id: dto.replyToId, projectId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException('Reply target message not found');
      }
    }

    const message = this.messageRepo.create({
      content: dto.content,
      attachmentPath: dto.attachmentPath ?? null,
      replyToId: dto.replyToId ?? null,
      projectId,
      authorId,
      tenantId,
    });
    const saved = await this.messageRepo.save(message);

    this.eventEmitter.emit('message.sent', {
      messageId: saved.id,
      projectId,
      tenantId,
      authorId,
      replyToId: saved.replyToId,
    });

    return saved;
  }

  async findByProject(
    tenantId: string,
    projectId: string,
    offset = 0,
    limit = 50,
  ): Promise<{ data: ProjectMessage[]; total: number }> {
    const [data, total] = await this.messageRepo.findAndCount({
      where: { projectId, tenantId },
      relations: ['author', 'author.profile'],
      skip: offset,
      take: limit,
      order: { createdAt: 'ASC' },
    });
    return { data, total };
  }
}
