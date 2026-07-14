import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ProjectsService } from './projects.service.js';
import { Project } from './entities/project.entity.js';
import { ProjectMembersService } from '../project-members/project-members.service.js';
import { User } from '../../identity/users/entities/user.entity.js';
import {
  ProjectVisibility,
  ProjectRole,
} from '@plic-mti-highfive/shared-types';

type ProjectRepoMock = {
  create: Mock<(data: Partial<Project>) => Partial<Project>>;
  save: Mock<(data: Partial<Project>) => Partial<Project>>;
  findOne: Mock<() => Promise<Project | null>>;
  findAndCount: Mock<() => Promise<[Project[], number]>>;
  softDelete: Mock<() => Promise<{ affected: number }>>;
};

type MembersServiceMock = {
  addOwner: Mock<ProjectMembersService['addOwner']>;
  assertRole: Mock<ProjectMembersService['assertRole']>;
  getOwnersForProjects: Mock<ProjectMembersService['getOwnersForProjects']>;
};

type EventEmitterMock = {
  emit: Mock<(event: string, payload: unknown) => boolean>;
};

describe('ProjectsService', () => {
  let service: ProjectsService;
  let projectRepo: ProjectRepoMock;
  let membersService: MembersServiceMock;
  let eventEmitter: EventEmitterMock;

  const tenantId = 'tenant-1';
  const userId = 'user-1';

  beforeEach(async () => {
    projectRepo = {
      create: vi
        .fn<(data: Partial<Project>) => Partial<Project>>()
        .mockImplementation((data: Partial<Project>) => ({
          id: 'proj-1',
          ...data,
        })),
      save: vi
        .fn<(data: Partial<Project>) => Partial<Project>>()
        .mockImplementation((data: Partial<Project>) => ({
          id: 'proj-1',
          ...data,
        })),
      findOne: vi.fn<() => Promise<Project | null>>(),
      findAndCount: vi
        .fn<() => Promise<[Project[], number]>>()
        .mockResolvedValue([[], 0]),
      softDelete: vi
        .fn<() => Promise<{ affected: number }>>()
        .mockResolvedValue({ affected: 1 }),
    };

    membersService = {
      addOwner: vi
        .fn<ProjectMembersService['addOwner']>()
        .mockResolvedValue(
          {} as Awaited<ReturnType<ProjectMembersService['addOwner']>>,
        ),
      assertRole: vi
        .fn<ProjectMembersService['assertRole']>()
        .mockResolvedValue({
          projectId: 'proj-1',
          userId,
          tenantId,
          role: ProjectRole.OWNER,
        } as Awaited<ReturnType<ProjectMembersService['assertRole']>>),
      getOwnersForProjects: vi
        .fn<ProjectMembersService['getOwnersForProjects']>()
        .mockResolvedValue(
          new Map<string, User>([
            ['proj-1', { id: userId, email: 'owner@example.com' } as User],
          ]),
        ),
    };

    eventEmitter = {
      emit: vi.fn<(event: string, payload: unknown) => boolean>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectsService,
        { provide: getRepositoryToken(Project), useValue: projectRepo },
        { provide: ProjectMembersService, useValue: membersService },
        { provide: EventEmitter2, useValue: eventEmitter },
      ],
    }).compile();

    service = module.get<ProjectsService>(ProjectsService);
  });

  describe('create', () => {
    it('should create project and add creator as OWNER', async () => {
      const result = await service.create(tenantId, userId, {
        name: 'My Project',
      });

      expect(result.name).toBe('My Project');
      expect(result.owner?.userId).toBe(userId);
      expect(membersService.addOwner).toHaveBeenCalledWith(
        tenantId,
        'proj-1',
        userId,
      );
    });
  });

  describe('update', () => {
    it('should emit event when visibility changes', async () => {
      projectRepo.findOne.mockResolvedValue({
        id: 'proj-1',
        tenantId,
        visibility: ProjectVisibility.PRIVATE,
      } as Project);

      await service.update(tenantId, 'proj-1', userId, {
        visibility: ProjectVisibility.PUBLIC,
      });

      expect(eventEmitter.emit).toHaveBeenCalledWith(
        'project.visibility.changed',
        expect.objectContaining({
          oldVisibility: ProjectVisibility.PRIVATE,
          newVisibility: ProjectVisibility.PUBLIC,
        }),
      );
    });
  });

  describe('softDelete', () => {
    it('should soft delete project (OWNER only)', async () => {
      await service.softDelete(tenantId, 'proj-1', userId);

      expect(membersService.assertRole).toHaveBeenCalledWith(
        tenantId,
        'proj-1',
        userId,
        [ProjectRole.OWNER],
      );
      expect(projectRepo.softDelete).toHaveBeenCalledWith({
        id: 'proj-1',
        tenantId,
      });
    });
  });
});
