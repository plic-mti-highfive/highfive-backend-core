import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Ticket } from './entities/ticket.entity.js';
import { CreateTicketDto } from './dto/create-ticket.dto.js';
import { UpdateTicketDto } from './dto/update-ticket.dto.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { UsersService } from '../../identity/users/users.service.js';
import { ProjectRole } from '@plic-mti-highfive/shared-types';

const WRITE_ROLES = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER];

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepo: Repository<Ticket>,
    private readonly membersService: ProjectMembersService,
    private readonly usersService: UsersService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(
    tenantId: string,
    projectId: string,
    userId: string,
    dto: CreateTicketDto,
  ): Promise<Ticket> {
    await this.membersService.assertRole(
      tenantId,
      projectId,
      userId,
      WRITE_ROLES,
    );

    if (dto.assigneeId) {
      await this.validateAssignee(tenantId, projectId, dto.assigneeId);
    }

    const ticket = this.ticketRepo.create({
      ...dto,
      projectId,
      tenantId,
    });
    const saved = await this.ticketRepo.save(ticket);

    this.eventEmitter.emit('ticket.created', {
      ticketId: saved.id,
      projectId,
      tenantId,
    });

    return saved;
  }

  async findByProject(
    tenantId: string,
    projectId: string,
    offset = 0,
    limit = 20,
  ): Promise<{ data: Ticket[]; total: number }> {
    const [data, total] = await this.ticketRepo.findAndCount({
      where: { projectId, tenantId },
      relations: ['assignee', 'assignee.profile'],
      skip: offset,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, total };
  }

  async findById(
    tenantId: string,
    projectId: string,
    ticketId: string,
  ): Promise<Ticket> {
    const ticket = await this.ticketRepo.findOne({
      where: { id: ticketId, projectId, tenantId },
      relations: ['assignee', 'assignee.profile'],
    });
    if (!ticket) throw new NotFoundException('Ticket not found');
    return ticket;
  }

  async update(
    tenantId: string,
    projectId: string,
    ticketId: string,
    userId: string,
    dto: UpdateTicketDto,
  ): Promise<Ticket> {
    await this.membersService.assertRole(
      tenantId,
      projectId,
      userId,
      WRITE_ROLES,
    );

    const ticket = await this.findById(tenantId, projectId, ticketId);

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      await this.validateAssignee(tenantId, projectId, dto.assigneeId);
    }

    Object.assign(ticket, dto);
    const saved = await this.ticketRepo.save(ticket);

    this.eventEmitter.emit('ticket.updated', {
      ticketId: saved.id,
      projectId,
      tenantId,
      changes: dto,
    });

    return saved;
  }

  private async validateAssignee(
    tenantId: string,
    projectId: string,
    assigneeId: string,
  ): Promise<void> {
    // Must be an active user
    await this.usersService.findActiveById(tenantId, assigneeId);
    // Must be a project member
    const member = await this.membersService.getMemberRole(
      tenantId,
      projectId,
      assigneeId,
    );
    if (!member) {
      throw new BadRequestException(
        'Assignee must be an active member of the project',
      );
    }
  }
}
