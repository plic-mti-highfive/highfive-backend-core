import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TicketsService } from './tickets.service.js';
import { Ticket } from './entities/ticket.entity.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { UsersService } from '../../identity/users/users.service.js';
import { ProjectRole, TicketStatus, UserStatus } from '../../shared/enums/index.js';

describe('TicketsService', () => {
  let service: TicketsService;
  let ticketRepo: any;
  let membersService: jest.Mocked<Partial<ProjectMembersService>>;
  let usersService: jest.Mocked<Partial<UsersService>>;
  let eventEmitter: jest.Mocked<Partial<EventEmitter2>>;

  const tenantId = 'tenant-1';
  const projectId = 'project-1';
  const userId = 'user-1';

  beforeEach(async () => {
    ticketRepo = {
      create: jest.fn().mockImplementation((data) => ({ id: 'ticket-1', ...data })),
      save: jest.fn().mockImplementation((data) => ({ id: 'ticket-1', ...data })),
      findOne: jest.fn(),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    membersService = {
      assertRole: jest.fn().mockResolvedValue({
        projectId,
        userId,
        tenantId,
        role: ProjectRole.MEMBER,
      }),
      getMemberRole: jest.fn(),
    };

    usersService = {
      findActiveById: jest.fn().mockResolvedValue({
        id: userId,
        status: UserStatus.ACTIVE,
      }),
    };

    eventEmitter = {
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketsService,
        { provide: getRepositoryToken(Ticket), useValue: ticketRepo },
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
      membersService.getMemberRole!.mockResolvedValue(null);

      await expect(
        service.create(tenantId, projectId, userId, {
          title: 'Fix bug',
          assigneeId: 'non-member',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject VIEWER from creating tickets', async () => {
      membersService.assertRole!.mockRejectedValue(
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
      };
      ticketRepo.findOne.mockResolvedValue(existingTicket);
      ticketRepo.save.mockImplementation((data: any) => data);

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
