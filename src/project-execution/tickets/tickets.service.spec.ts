import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { Ticket } from './entities/ticket.entity.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { UsersService } from '../../identity/users/users.service.js';
import {
  ProjectRole,
  TicketStatus,
  UserStatus,
} from '@plic-mti-highfive/shared-types';
import { TicketComment } from './entities/ticket-comment.entity.js';
import { ChecklistItem } from './entities/checklist-item.entity.js';

type TicketRepoMock = {
  create: Mock<(data: Partial<Ticket>) => Partial<Ticket>>;
  save: Mock<(data: Partial<Ticket>) => Partial<Ticket>>;
  findOne: Mock<() => Promise<Ticket | null>>;
  findAndCount: Mock<() => Promise<[Ticket[], number]>>;
};

type MembersServiceMock = {
  assertRole: Mock<ProjectMembersService['assertRole']>;
  getMemberRole: Mock<ProjectMembersService['getMemberRole']>;
};

type UsersServiceMock = {
  findActiveById: Mock<UsersService['findActiveById']>;
};

type EventEmitterMock = {
  emit: Mock<(event: string, payload: unknown) => boolean>;
};

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepo: TicketRepoMock;
  let membersService: MembersServiceMock;
  let usersService: UsersServiceMock;
  let eventEmitter: EventEmitterMock;

  const tenantId = 'tenant-1';
  const projectId = 'project-1';
  const userId = 'user-1';

  beforeEach(async () => {
    ticketRepo = {
      create: vi
        .fn<(data: Partial<Ticket>) => Partial<Ticket>>()
        .mockImplementation((data: Partial<Ticket>) => ({
          id: 'ticket-1',
          ...data,
        })),
      save: vi
        .fn<(data: Partial<Ticket>) => Partial<Ticket>>()
        .mockImplementation((data: Partial<Ticket>) => ({
          id: 'ticket-1',
          ...data,
        })),
      findOne: vi.fn<() => Promise<Ticket | null>>(),
      findAndCount: vi
        .fn<() => Promise<[Ticket[], number]>>()
        .mockResolvedValue([[], 0]),
    };

    membersService = {
      assertRole: vi
        .fn<ProjectMembersService['assertRole']>()
        .mockResolvedValue({
          projectId,
          userId,
          tenantId,
          role: ProjectRole.MEMBER,
        } as Awaited<ReturnType<ProjectMembersService['assertRole']>>),
      getMemberRole: vi.fn<ProjectMembersService['getMemberRole']>(),
    };

    usersService = {
      findActiveById: vi
        .fn<UsersService['findActiveById']>()
        .mockResolvedValue({
          id: userId,
          status: UserStatus.ACTIVE,
        } as Awaited<ReturnType<UsersService['findActiveById']>>),
    };

    eventEmitter = {
      emit: vi.fn<(event: string, payload: unknown) => boolean>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
        { provide: getRepositoryToken(ChecklistItem), useValue: {} },
        { provide: getRepositoryToken(TicketComment), useValue: {} },
        { provide: ProjectMembersService, useValue: membersService },
        { provide: UsersService, useValue: usersService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<TicketsService>(TicketsService);
  });

  describe('create', () => {
    it('should create a ticket and emit event', async () => {
      const result = await service.create(tenantId, projectId, userId, {
        title: 'Fix bug',
      });

      expect(membersService.assertRole).toHaveBeenCalledWith(
        tenantId,
        projectId,
        userId,
        [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER],
      );
      expect(result.title).toBe('Fix bug');
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ticket.created',
        expect.objectContaining({ projectId, tenantId }),
      );
    });

    it('should validate assignee is active project member', async () => {
      membersService.getMemberRole.mockResolvedValue(null);

      await expect(
        service.create(tenantId, projectId, userId, {
          title: 'Fix bug',
          assigneeId: 'non-member',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject VIEWER from creating tickets', async () => {
      membersService.assertRole.mockRejectedValue(
        new ForbiddenException('Insufficient project role'),
      );

      await expect(
        service.create(tenantId, projectId, 'viewer-user', {
          title: 'Fix bug',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update ticket and emit event', async () => {
      const existingTicket = {
        id: 'ticket-1',
        projectId,
        tenantId,
        title: 'Old title',
        status: TicketStatus.TODO,
        assigneeId: null,
      } as unknown as Ticket;
      ticketRepo.findOne.mockResolvedValue(existingTicket);
      ticketRepo.save.mockImplementation((data: Partial<Ticket>) => data);

      const result = await service.update(
        tenantId,
        projectId,
        'ticket-1',
        userId,
        { status: TicketStatus.IN_PROGRESS },
      );

      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'ticket.updated',
        expect.objectContaining({ ticketId: 'ticket-1' }),
      );
    });
  });
});
